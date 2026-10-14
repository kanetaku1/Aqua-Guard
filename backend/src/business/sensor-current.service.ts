import { Injectable } from '@nestjs/common';
import { Principal } from '../auth/auth.service';
import { AdminThresholdsService, Threshold } from '../admin/admin-thresholds.service';
import { ApiProblem } from '../http/problem';
import { InfluxService } from '../infrastructure/influx.service';
import { PostgresService } from '../infrastructure/postgres.service';
import { SensorParameter } from '../infrastructure/sensor-reading';
import { BusinessScopeService } from './business-scope.service';

const PARAMETERS: SensorParameter[] = ['do', 'ph', 'temperature', 'tds', 'turbidity', 'water_level'];
type Severity = 'normal' | 'attention' | 'warning' | 'critical';
type Quality = 'live' | 'delayed' | 'offline' | 'no_data';
interface LatestRow {
  _time?: string; value?: number; validity?: string;
  device_id?: string; parameter?: string;
}

export function severityFor(value: number, threshold: Threshold): Severity {
  const above = (limit: number | null) => limit !== null
    && (threshold.parameter === 'vibrio' ? value >= limit : value > limit);
  if ((threshold.criticalLow !== null && value < threshold.criticalLow)
    || above(threshold.criticalHigh)) return 'critical';
  if ((threshold.warningLow !== null && value < threshold.warningLow)
    || above(threshold.warningHigh)) return 'warning';
  if ((threshold.attentionLow !== null && value < threshold.attentionLow)
    || above(threshold.attentionHigh)) return 'attention';
  return 'normal';
}

@Injectable()
export class SensorCurrentService {
  constructor(
    private readonly scope: BusinessScopeService,
    private readonly postgres: PostgresService,
    private readonly influx: InfluxService,
    private readonly thresholds: AdminThresholdsService,
  ) {}

  async get(principal: Principal, pondId: string) {
    if (principal.role !== 'technical_manager') {
      throw new ApiProblem(403, 'forbidden', 'Technical manager access required');
    }
    const pond = await this.scope.requirePond(principal, pondId);
    const [devices, rules] = await Promise.all([
      this.postgres.pool.query<{ device_id: string; parameter: SensorParameter }>(
        `SELECT d.device_id, d.parameter FROM devices d
         JOIN device_assignments a ON a.device_id = d.id AND a.unassigned_at IS NULL
         WHERE a.pond_id = $1 AND d.enabled AND d.type = 'sensor'`, [pond.pondUuid],
      ),
      this.postgres.pool.query<{
        sensor_delayed_after_minutes: number; sensor_offline_after_minutes: number;
      }>(
        `SELECT sensor_delayed_after_minutes, sensor_offline_after_minutes
         FROM operational_rule_versions WHERE company_id = $1 AND effective_to IS NULL`,
        [principal.companyId],
      ),
    ]);
    const allowed = new Map(devices.rows.map((row) => [row.device_id, row.parameter]));
    const delayedMs = (rules.rows[0]?.sensor_delayed_after_minutes ?? 15) * 60000;
    const offlineMs = (rules.rows[0]?.sensor_offline_after_minutes ?? 60) * 60000;
    const now = Date.now();
    let rows: LatestRow[];
    try {
      rows = await this.influx.client.getQueryApi(this.influx.org).collectRows<LatestRow>(
        `from(bucket: ${JSON.stringify(this.influx.bucket)})
         |> range(start: 0, stop: time(v: ${JSON.stringify(new Date(now + 1).toISOString())}))
         |> filter(fn: (r) => r._measurement == "sensor_readings"
           and r.farm_id == ${JSON.stringify(pond.farmId)}
           and r.pond_id == ${JSON.stringify(pond.pondId)}
           and (r._field == "value" or r._field == "validity"))
         |> pivot(rowKey: ["_time"], columnKey: ["_field"], valueColumn: "_value")
         |> group(columns: ["device_id", "parameter"])
         |> last(column: "_time")`,
      );
    } catch {
      throw new ApiProblem(503, 'storage_unavailable', 'Sensor data is unavailable');
    }
    const latest = new Map<SensorParameter, LatestRow>();
    for (const row of rows) {
      if (!row.device_id || allowed.get(row.device_id) !== row.parameter
        || !PARAMETERS.includes(row.parameter as SensorParameter)) continue;
      const parameter = row.parameter as SensorParameter;
      const previous = latest.get(parameter);
      if (!previous || Date.parse(row._time ?? '') > Date.parse(previous._time ?? '')) {
        latest.set(parameter, row);
      }
    }
    const registered = new Map(devices.rows.map((row) => [row.parameter, row.device_id]));
    const items = [];
    for (const parameter of PARAMETERS) {
      const threshold = await this.thresholds.effectiveThreshold(
        principal.companyId, pond.farmUuid, parameter,
      );
      const row = latest.get(parameter);
      const measuredAt = Date.parse(row?._time ?? '');
      const age = now - measuredAt;
      const deviceId = row?.device_id ?? registered.get(parameter);
      // No sensor, no reading or an invalid latest reading: report no_data instead of failing
      // the whole response, so the Pond views stay usable while some sensors are missing.
      if (!row || row.validity !== 'valid' || typeof row.value !== 'number'
        || !Number.isFinite(row.value) || !Number.isFinite(measuredAt) || age < 0) {
        items.push({ parameter, unit: threshold.unit, deviceId, value: null,
          severity: 'normal' as Severity, quality: 'no_data' as Quality,
          measuredAt: null, threshold });
        continue;
      }
      if (age > offlineMs) {
        items.push({ parameter, unit: threshold.unit, deviceId, value: null,
          severity: 'attention' as Severity, quality: 'offline' as Quality,
          measuredAt: new Date(measuredAt).toISOString(), threshold });
        continue;
      }
      const quality: Quality = age <= delayedMs ? 'live' : 'delayed';
      items.push({ parameter, unit: threshold.unit, deviceId,
        value: row.value, severity: severityFor(row.value, threshold), quality,
        measuredAt: new Date(measuredAt).toISOString(), threshold });
    }
    return { items };
  }
}
