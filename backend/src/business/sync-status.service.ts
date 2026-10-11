import { Injectable } from '@nestjs/common';
import { Principal } from '../auth/auth.service';
import { ApiProblem } from '../http/problem';
import { InfluxService } from '../infrastructure/influx.service';
import { PostgresService } from '../infrastructure/postgres.service';
import { BusinessScopeService } from './business-scope.service';

type Quality = 'live' | 'delayed' | 'offline' | 'no_data';

@Injectable()
export class SyncStatusService {
  constructor(
    private readonly postgres: PostgresService,
    private readonly influx: InfluxService,
    private readonly scope: BusinessScopeService,
  ) {}

  async get(principal: Principal): Promise<{
    quality: Quality; syncedAt: string | null; nextSyncAt: string;
  }> {
    const farmIds = await this.scope.visibleFarmIds(principal);
    const next = () => new Date(Date.now() + 5 * 60 * 1000).toISOString();
    if (farmIds.length === 0) {
      return { quality: 'no_data', syncedAt: null, nextSyncAt: next() };
    }
    const rules = await this.postgres.pool.query<{
      sensor_delayed_after_minutes: number; sensor_offline_after_minutes: number;
    }>(
      `SELECT sensor_delayed_after_minutes, sensor_offline_after_minutes
       FROM operational_rule_versions WHERE company_id = $1 AND effective_to IS NULL`,
      [principal.companyId],
    );
    const delayedMs = (rules.rows[0]?.sensor_delayed_after_minutes ?? 15) * 60 * 1000;
    const offlineMs = (rules.rows[0]?.sensor_offline_after_minutes ?? 60) * 60 * 1000;
    let rows: { _time?: string }[];
    try {
      rows = await this.influx.client.getQueryApi(this.influx.org).collectRows<{ _time?: string }>(
        `from(bucket: ${JSON.stringify(this.influx.bucket)})
         |> range(start: 0)
         |> filter(fn: (r) => r._measurement == "sensor_readings"
           and (r._field == "value" or r._field == "validity")
           and contains(value: r.farm_id, set: ${JSON.stringify(farmIds)}))
         |> pivot(rowKey: ["_time"], columnKey: ["_field"], valueColumn: "_value")
         |> filter(fn: (r) => r.validity == "valid")
         |> group(columns: ["farm_id"]) |> last(column: "_time")`,
      );
    } catch {
      throw new ApiProblem(503, 'storage_unavailable', 'Sensor data is unavailable');
    }
    const now = new Date();
    const last = rows.map((row) => row._time ? new Date(row._time).getTime() : NaN)
      .filter(Number.isFinite).reduce((latest, time) => Math.max(latest, time), -Infinity);
    const ageMs = Math.max(0, now.getTime() - last);
    const quality: Quality = last === -Infinity ? 'no_data'
      : ageMs <= delayedMs ? 'live' : ageMs <= offlineMs ? 'delayed' : 'offline';
    const nextSyncAt = new Date(now.getTime() + 5 * 60 * 1000);
    await this.postgres.pool.query(
      `INSERT INTO sensor_sync_checkpoints
         (scope_key, last_success_at, processed_through, next_sync_at)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (scope_key) DO UPDATE SET
         last_success_at = EXCLUDED.last_success_at,
         processed_through = EXCLUDED.processed_through,
         next_sync_at = EXCLUDED.next_sync_at, updated_at = now()`,
      [`header:user:${principal.userId}`, now, last === -Infinity ? null : new Date(last), nextSyncAt],
    );
    return { quality, syncedAt: now.toISOString(), nextSyncAt: nextSyncAt.toISOString() };
  }
}
