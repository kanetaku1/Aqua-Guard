import { Injectable } from '@nestjs/common';
import { ApiProblem } from '../http/problem';
import { InfluxService } from '../infrastructure/influx.service';
import { PostgresService } from '../infrastructure/postgres.service';

interface AeratorRow { device_id: string; pond_id: string; assigned_at: Date }
interface FarmRow { public_id: string; sensor_offline_after_minutes: number | null }
interface TelemetryRow {
  _time?: string; pond_id?: string; device_id?: string; _value?: unknown;
}
interface FaultRow {
  _time?: string; pond_id?: string; device_id?: string;
  state?: string; fault_code?: string; event_id?: string;
}
interface AssignmentRow {
  device_id: string; pond_id: string; pond_name: string;
  assigned_at: Date; unassigned_at: Date | null;
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

  async faultEvents(farmUuid: string, start: Date, end: Date, now = new Date()) {
    const [farm, assignments] = await Promise.all([
      this.postgres.pool.query<{ public_id: string }>(
        `SELECT public_id FROM farms WHERE id=$1`, [farmUuid],
      ),
      this.postgres.pool.query<AssignmentRow>(
        `SELECT d.device_id,p.public_id AS pond_id,p.name AS pond_name,
           a.assigned_at,a.unassigned_at
         FROM device_assignments a JOIN devices d ON d.id=a.device_id
         JOIN ponds p ON p.id=a.pond_id
         WHERE p.farm_id=$1 AND d.type IN ('aerator','pump')
           AND a.assigned_at < $2 AND (a.unassigned_at IS NULL OR a.unassigned_at >= $3)`,
        [farmUuid, now < end ? now : end, start],
      ),
    ]);
    if (!farm.rows[0]) throw new Error('Daily Report Farm not found');
    if (assignments.rows.length === 0) return [];
    let feedback: FaultRow[];
    try {
      feedback = await this.influx.client.getQueryApi(this.influx.org)
        .collectRows<FaultRow>(
          `from(bucket: ${JSON.stringify(this.influx.bucket)})
           |> range(start: 0, stop: time(v: ${JSON.stringify((now < end ? now : end).toISOString())}))
           |> filter(fn: (r) => r._measurement == "actuator_feedback"
             and r.farm_id == ${JSON.stringify(farm.rows[0].public_id)}
             and contains(value: r._field, set: ["state", "fault_code", "event_id"]))
           |> pivot(rowKey: ["_time", "pond_id", "device_id"],
             columnKey: ["_field"], valueColumn: "_value")`,
        );
    } catch {
      throw new ApiProblem(503, 'storage_unavailable', 'Device telemetry is unavailable');
    }
    const events: {
      id: string; source: 'actuator'; equipment: string;
      pond: { id: string; name: string }; failure: string;
      occurredAt: string; action: null; status: 'in_progress' | 'resolved';
    }[] = [];
    const active = new Map<string, typeof events[number] | null>();
    for (const row of feedback.sort((a, b) => (a._time ?? '').localeCompare(b._time ?? ''))) {
      if (!row._time || !row.pond_id || !row.device_id
        || !['on', 'off', 'fault'].includes(row.state ?? '')) continue;
      const at = new Date(row._time);
      if (!Number.isFinite(at.getTime()) || at >= now) continue;
      const assignment = assignments.rows.find((item) => item.pond_id === row.pond_id
        && item.device_id === row.device_id && item.assigned_at <= at
        && (!item.unassigned_at || at < item.unassigned_at));
      if (!assignment) continue;
      const key = `${row.pond_id}:${row.device_id}`;
      const previous = active.get(key);
      if (row.state === 'fault') {
        if (active.has(key)) continue;
        if (at < start) {
          active.set(key, null);
          continue;
        }
        if (at >= end) continue;
        const event = {
          id: `actuator:${row.pond_id}:${row.device_id}:${at.toISOString()}`,
          source: 'actuator' as const, equipment: row.device_id,
          pond: { id: row.pond_id, name: assignment.pond_name },
          failure: row.fault_code?.trim() || 'Actuator fault',
          occurredAt: at.toISOString(), action: null,
          status: 'in_progress' as const,
        };
        active.set(key, event);
        events.push(event);
      } else if (active.has(key)) {
        if (previous) previous.status = 'resolved';
        active.delete(key);
      }
    }
    return events;
  }
}
