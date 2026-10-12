import { Injectable } from '@nestjs/common';
import { Principal } from '../auth/auth.service';
import { AdminThresholdsService } from '../admin/admin-thresholds.service';
import { ApiProblem } from '../http/problem';
import { InfluxService } from '../infrastructure/influx.service';
import { PostgresService } from '../infrastructure/postgres.service';
import { SensorParameter } from '../infrastructure/sensor-reading';
import { BusinessScopeService } from './business-scope.service';
import { severityFor } from './sensor-current.service';

const PARAMETERS: SensorParameter[] = ['do', 'ph', 'temperature', 'tds', 'turbidity', 'water_level'];
type Severity = 'normal' | 'attention' | 'warning' | 'critical';
const RANK: Record<Severity, number> = { normal: 0, attention: 1, warning: 2, critical: 3 };
const STATE_RANK: Record<string, number> = {
  unacknowledged: 3, acknowledged: 2, in_progress: 1,
};
interface Pond { id: string; public_id: string; name: string }
interface Assignment {
  pond_id: string; pond_public_id: string; device_id: string;
  parameter: SensorParameter; assigned_at: Date;
}
interface Latest {
  _time?: string; pond_id?: string; device_id?: string;
  parameter?: string; value?: number; validity?: string;
}
interface AlertSummary {
  pond_id: string; severity: Severity; state: string;
}

function worst(a: Severity, b: Severity): Severity {
  return RANK[a] >= RANK[b] ? a : b;
}

@Injectable()
export class PondWaterQualityService {
  constructor(
    private readonly scope: BusinessScopeService,
    private readonly postgres: PostgresService,
    private readonly influx: InfluxService,
    private readonly thresholds: AdminThresholdsService,
  ) {}

  async list(principal: Principal, farmId: string) {
    if (principal.role !== 'technical_manager') {
      throw new ApiProblem(403, 'forbidden', 'Technical manager access required');
    }
    return this.snapshot(principal, farmId);
  }

  // Called after the report service has checked Farm and Report visibility.
  async snapshot(principal: Principal, farmId: string) {
    const visible = await this.scope.visibleFarmIds(principal);
    const farm = await this.postgres.pool.query<{ id: string }>(
      `SELECT id FROM farms WHERE public_id=$1 AND company_id=$2 AND public_id=ANY($3)`,
      [farmId, principal.companyId, visible],
    );
    if (!farm.rows[0]) throw new ApiProblem(404, 'not_found', 'Farm not found');
    const farmUuid = farm.rows[0].id;
    const [ponds, assignments, alerts, rules] = await Promise.all([
      this.postgres.pool.query<Pond>(
        `SELECT id,public_id,name FROM ponds WHERE farm_id=$1 ORDER BY name,public_id`,
        [farmUuid],
      ),
      this.postgres.pool.query<Assignment>(
        `SELECT a.pond_id,p.public_id AS pond_public_id,d.device_id,d.parameter,a.assigned_at
         FROM device_assignments a JOIN devices d ON d.id=a.device_id
         JOIN ponds p ON p.id=a.pond_id
         WHERE p.farm_id=$1 AND a.unassigned_at IS NULL AND d.enabled AND d.type='sensor'`,
        [farmUuid],
      ),
      this.postgres.pool.query<AlertSummary>(
        `SELECT al.pond_id,al.severity,al.state FROM alerts al
         JOIN ponds p ON p.id=al.pond_id
         WHERE p.farm_id=$1 AND al.state<>'resolved'`, [farmUuid],
      ),
      this.postgres.pool.query<{
        sensor_delayed_after_minutes: number; sensor_offline_after_minutes: number;
      }>(
        `SELECT sensor_delayed_after_minutes,sensor_offline_after_minutes
         FROM operational_rule_versions WHERE company_id=$1 AND effective_to IS NULL`,
        [principal.companyId],
      ),
    ]);
    const thresholds = await Promise.all(PARAMETERS.map((parameter) =>
      this.thresholds.effectiveThreshold(principal.companyId, farmUuid, parameter)));
    const byParameter = new Map(PARAMETERS.map((parameter, index) =>
      [parameter, thresholds[index]]));
    const normalRanges = PARAMETERS.map((parameter) => {
      const threshold = byParameter.get(parameter)!;
      return { parameter, unit: threshold.unit,
        normalMin: threshold.attentionLow, normalMax: threshold.attentionHigh };
    });
    const now = Date.now();
    const delayedMs = (rules.rows[0]?.sensor_delayed_after_minutes ?? 15) * 60_000;
    const offlineMs = (rules.rows[0]?.sensor_offline_after_minutes ?? 60) * 60_000;
    let readings: Latest[];
    try {
      readings = await this.influx.client.getQueryApi(this.influx.org).collectRows<Latest>(
        `from(bucket: ${JSON.stringify(this.influx.bucket)})
         |> range(start: 0, stop: time(v: ${JSON.stringify(new Date(now + 1).toISOString())}))
         |> filter(fn: (r) => r._measurement == "sensor_readings"
           and r.farm_id == ${JSON.stringify(farmId)}
           and (r._field == "value" or r._field == "validity"))
         |> pivot(rowKey: ["_time"], columnKey: ["_field"], valueColumn: "_value")
         |> group(columns: ["pond_id", "device_id", "parameter"])
         |> last(column: "_time")`,
      );
    } catch {
      throw new ApiProblem(503, 'storage_unavailable', 'Sensor data is unavailable');
    }
    const allowed = new Map<string, Assignment>(assignments.rows.map((assignment) =>
      [`${assignment.pond_public_id}:${assignment.device_id}:${assignment.parameter}`,
        assignment]));
    const latest = new Map<string, Latest>();
    for (const reading of readings) {
      if (!reading.pond_id || !reading.device_id || !reading.parameter || !reading._time) continue;
      const key = `${reading.pond_id}:${reading.device_id}:${reading.parameter}`;
      const assignment = allowed.get(key);
      const at = Date.parse(reading._time);
      if (!assignment || !Number.isFinite(at) || at < assignment.assigned_at.getTime()) continue;
      const previous = latest.get(`${assignment.pond_id}:${assignment.parameter}`);
      if (!previous || at > Date.parse(previous._time ?? '')) {
        latest.set(`${assignment.pond_id}:${assignment.parameter}`, reading);
      }
    }
    const byPond = new Map<string, AlertSummary[]>();
    for (const alert of alerts.rows) {
      const group = byPond.get(alert.pond_id) ?? [];
      group.push(alert);
      byPond.set(alert.pond_id, group);
    }
    const counts = { normal: 0, attention: 0, warning: 0, critical: 0 };
    const items = ponds.rows.map((pond) => {
      const values = {} as Record<SensorParameter, {
        value: number | null; severity: Severity; quality: string; measuredAt: string | null;
      }>;
      let status: Severity = 'normal';
      for (const parameter of PARAMETERS) {
        const reading = latest.get(`${pond.id}:${parameter}`);
        const at = Date.parse(reading?._time ?? '');
        const age = now - at;
        const valid = reading?.validity === 'valid' && typeof reading.value === 'number'
          && Number.isFinite(reading.value) && Number.isFinite(at) && age >= 0;
        const quality = !reading ? 'no_data'
          : !valid || age > offlineMs ? 'offline'
          : age > delayedMs ? 'delayed' : 'live';
        const value = quality === 'live' || quality === 'delayed' ? reading!.value! : null;
        const severity: Severity = quality === 'offline' ? 'attention'
          : value === null ? 'normal' : severityFor(value, byParameter.get(parameter)!);
        values[parameter] = { value, severity, quality,
          measuredAt: Number.isFinite(at) ? new Date(at).toISOString() : null };
        status = worst(status, severity);
      }
      const open = byPond.get(pond.id) ?? [];
      const leading = open.sort((a, b) => RANK[b.severity] - RANK[a.severity]
        || (STATE_RANK[b.state] ?? 0) - (STATE_RANK[a.state] ?? 0))[0];
      if (leading) status = worst(status, leading.severity);
      counts[status] += 1;
      return { pond: { id: pond.public_id, name: pond.name }, status, values,
        openAlerts: open.length, worstAlertState: leading?.state ?? null };
    });
    return { items, counts, normalRanges };
  }
}
