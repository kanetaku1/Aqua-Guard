import { Injectable } from '@nestjs/common';
import { ApiProblem } from '../http/problem';
import { InfluxService } from '../infrastructure/influx.service';
import { PostgresService } from '../infrastructure/postgres.service';

interface AeratorRow { device_id: string; pond_id: string; assigned_at: Date }
interface FarmRow { public_id: string; sensor_offline_after_minutes: number | null }
interface TelemetryRow {
  _time?: string; pond_id?: string; device_id?: string; _value?: unknown;
}

@Injectable()
export class DailyReportEquipmentService {
  constructor(
    private readonly postgres: PostgresService,
    private readonly influx: InfluxService,
  ) {}

  private async latest(farmId: string, measurement: string, field: string) {
    try {
      const rows = await this.influx.client.getQueryApi(this.influx.org)
        .collectRows<TelemetryRow>(
          `from(bucket: ${JSON.stringify(this.influx.bucket)})
           |> range(start: 0)
           |> filter(fn: (r) => r._measurement == ${JSON.stringify(measurement)}
             and r.farm_id == ${JSON.stringify(farmId)}
             and r._field == ${JSON.stringify(field)})
           |> group(columns: ["pond_id", "device_id"]) |> last()`,
        );
      return new Map(rows.filter((row) => row.pond_id && row.device_id)
        .map((row) => [`${row.pond_id}:${row.device_id}`, row]));
    } catch {
      throw new ApiProblem(503, 'storage_unavailable', 'Device telemetry is unavailable');
    }
  }

  async aerators(farmUuid: string, now = new Date()) {
    const [farm, devices] = await Promise.all([
      this.postgres.pool.query<FarmRow>(
        `SELECT f.public_id,r.sensor_offline_after_minutes
         FROM farms f LEFT JOIN operational_rule_versions r
           ON r.company_id=f.company_id AND r.effective_to IS NULL
         WHERE f.id=$1`, [farmUuid],
      ),
      this.postgres.pool.query<AeratorRow>(
        `SELECT d.device_id,p.public_id AS pond_id,a.assigned_at
         FROM devices d JOIN device_assignments a ON a.device_id=d.id
           AND a.unassigned_at IS NULL
         JOIN ponds p ON p.id=a.pond_id
         WHERE p.farm_id=$1 AND d.type='aerator' AND d.enabled`, [farmUuid],
      ),
    ]);
    if (!farm.rows[0]) throw new Error('Daily Report Farm not found');
    const byPond = new Map<string, { on: number; total: number }>();
    if (devices.rows.length === 0) return byPond;
    const [states, beats] = await Promise.all([
      this.latest(farm.rows[0].public_id, 'actuator_feedback', 'state'),
      this.latest(farm.rows[0].public_id, 'device_heartbeats', 'online_hint'),
    ]);
    const nowMs = now.getTime();
    const offlineMs = (farm.rows[0].sensor_offline_after_minutes ?? 60) * 60_000;
    for (const device of devices.rows) {
      const key = `${device.pond_id}:${device.device_id}`;
      const state = states.get(key);
      const beat = beats.get(key);
      const stateAt = Date.parse(state?._time ?? '');
      const beatAt = Date.parse(beat?._time ?? '');
      const validState = Number.isFinite(stateAt) && stateAt >= device.assigned_at.getTime()
        && stateAt <= nowMs && nowMs - stateAt <= offlineMs;
      const disconnected = Number.isFinite(beatAt)
        && beatAt >= device.assigned_at.getTime() && beatAt <= nowMs
        && beatAt > stateAt && beat?._value === false;
      if (!validState || disconnected || !['on', 'off', 'fault'].includes(String(state?._value))) {
        throw new ApiProblem(503, 'telemetry_not_ready', 'Aerator state is incomplete or stale');
      }
      const count = byPond.get(device.pond_id) ?? { on: 0, total: 0 };
      count.total++;
      if (state?._value === 'on') count.on++;
      byPond.set(device.pond_id, count);
    }
    return byPond;
  }
}
