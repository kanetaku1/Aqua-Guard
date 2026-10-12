import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { PoolClient } from 'pg';
import { AdminThresholdsService, Threshold } from '../admin/admin-thresholds.service';
import { InfluxService } from './influx.service';
import { PostgresService } from './postgres.service';
import { SensorParameter } from './sensor-reading';
import { anomalyStart, Direction, PeriodicSeverity, sideSeverity } from './periodic-severity';

const INITIAL_LOOKBACK_MS = 24 * 60 * 60 * 1000;
interface Farm {
  id: string; public_id: string; company_id: string;
  sensor_delayed_after_minutes: number | null;
  sensor_offline_after_minutes: number | null;
  attention_to_alert_minutes: number | null;
}
interface Device {
  id: string; device_id: string; pond_id: string; pond_public_id: string;
  parameter: SensorParameter; assigned_at: Date;
}
interface Point {
  _time?: string; value?: number; validity?: string; event_id?: string;
}
interface LastValid {
  _time?: string; pond_id?: string; device_id?: string;
}
interface OfflineState {
  id: string; current_alert_id: string | null; episode_no: string;
  offline_active: boolean;
}
interface State {
  id: string; direction: Direction; episode_no: string;
  current_alert_id: string | null; live_measured_through: Date | null;
  periodic_measured_through: Date | null; periodic_severity: PeriodicSeverity | null;
  periodic_anomaly_started_at: Date | null; critical_active: boolean;
}
interface Alert {
  id: string; state: string; severity: string; occurred_at: Date;
}

@Injectable()
export class PeriodicAlertService {
  constructor(
    private readonly postgres: PostgresService,
    private readonly influx: InfluxService,
    private readonly thresholds: AdminThresholdsService,
  ) {}

  async runOnce(now = new Date()): Promise<{ farms: number; points: number }> {
    const farms = await this.postgres.pool.query<Farm>(
      `SELECT f.id, f.public_id, f.company_id,
         r.sensor_delayed_after_minutes, r.sensor_offline_after_minutes,
         r.attention_to_alert_minutes
       FROM farms f LEFT JOIN operational_rule_versions r
         ON r.company_id=f.company_id AND r.effective_to IS NULL
       WHERE f.status='active' ORDER BY f.id`,
    );
    let points = 0;
    for (const farm of farms.rows) points += await this.processFarm(farm, now);
    return { farms: farms.rows.length, points };
  }

  private async processFarm(farm: Farm, now: Date): Promise<number> {
    const devices = await this.postgres.pool.query<Device>(
      `SELECT d.id, d.device_id, p.id AS pond_id, p.public_id AS pond_public_id,
         d.parameter, a.assigned_at
       FROM devices d JOIN device_assignments a ON a.device_id=d.id
         AND a.unassigned_at IS NULL
       JOIN ponds p ON p.id=a.pond_id
       WHERE p.farm_id=$1 AND p.status='in_operation'
         AND d.enabled AND d.type='sensor'
       ORDER BY p.id,d.id`, [farm.id],
    );
    const batches = [] as { device: Device; points: Point[] }[];
    for (const device of devices.rows) {
      const checkpoints = await this.postgres.pool.query<{
        periodic_measured_through: Date | null;
      }>(
        `SELECT periodic_measured_through FROM alert_detection_states
         WHERE pond_id=$1 AND device_id=$2 AND parameter=$3`,
        [device.pond_id, device.id, device.parameter],
      );
      const start = checkpoints.rows.length === 2
        && checkpoints.rows.every((row) => row.periodic_measured_through)
        ? Math.min(...checkpoints.rows.map((row) => row.periodic_measured_through!.getTime()))
        : Math.max(device.assigned_at.getTime(), now.getTime() - INITIAL_LOOKBACK_MS);
      batches.push({ device, points: await this.readPoints(farm, device, new Date(start), now) });
    }
    const latestValid = await this.readLatestValid(farm);
    const client = await this.postgres.pool.connect();
    try {
      await client.query('BEGIN');
      const scope = `periodic:farm:${farm.id}`;
      await client.query(
        `INSERT INTO sensor_sync_checkpoints (scope_key) VALUES ($1)
         ON CONFLICT DO NOTHING`, [scope],
      );
      await client.query('SELECT scope_key FROM sensor_sync_checkpoints WHERE scope_key=$1 FOR UPDATE',
        [scope]);
      let processed = 0;
      for (const batch of batches) {
        await this.ensureStates(client, batch.device);
        const states = await client.query<State>(
          `SELECT id,direction,episode_no,current_alert_id,live_measured_through,
             periodic_measured_through,periodic_severity,periodic_anomaly_started_at,
             critical_active
           FROM alert_detection_states
           WHERE pond_id=$1 AND device_id=$2 AND parameter=$3
           ORDER BY direction FOR UPDATE`,
          [batch.device.pond_id, batch.device.id, batch.device.parameter],
        );
        for (const point of batch.points) {
          const at = new Date(point._time!);
          if (at > now) continue;
          if (!point.event_id) continue;
          const receipt = await client.query<{
            status: string; critical_evaluation_status: string;
          }>(
            `SELECT status,critical_evaluation_status FROM ingestion_receipts
             WHERE device_id=$1 AND event_id=$2`, [batch.device.id, point.event_id],
          );
          if (!receipt.rows[0]) continue;
          if (receipt.rows[0].status === 'stored'
            || receipt.rows[0].status === 'pending') break;
          if (receipt.rows[0].status !== 'completed') continue;
          if (point.validity === 'valid' && typeof point.value === 'number'
            && Number.isFinite(point.value)) {
            const policy = await this.thresholds.thresholdAt(
              farm.company_id, farm.id, batch.device.parameter, at);
            for (const state of states.rows) await this.processSide(client, farm, batch.device,
              state, at, now, point.value, policy.threshold, policy.setId);
          } else {
            for (const state of states.rows) {
              if (state.periodic_measured_through && at <= state.periodic_measured_through) continue;
              await client.query(
                `UPDATE alert_detection_states SET periodic_measured_through=$2,
                   periodic_anomaly_started_at=NULL, periodic_severity=NULL,
                   updated_at=now() WHERE id=$1`, [state.id, at],
              );
              state.periodic_measured_through = at;
              state.periodic_anomaly_started_at = null;
              state.periodic_severity = null;
            }
          }
          processed += 1;
        }
      }
      for (const device of devices.rows) {
        const last = latestValid.get(`${device.pond_public_id}:${device.device_id}`);
        if (last && last >= device.assigned_at && last <= now) {
          await this.processOffline(client, farm, device, last, now);
        }
      }
      const positions = await client.query<{ processed_through: Date | null }>(
        `SELECT CASE WHEN count(*)=count(periodic_measured_through)
           THEN min(periodic_measured_through) ELSE NULL END AS processed_through
         FROM alert_detection_states s
         JOIN device_assignments a ON a.device_id=s.device_id
           AND a.pond_id=s.pond_id AND a.unassigned_at IS NULL
         JOIN devices d ON d.id=s.device_id
         JOIN ponds p ON p.id=s.pond_id
         WHERE p.farm_id=$1 AND p.status='in_operation'
           AND d.enabled AND d.type='sensor'`, [farm.id],
      );
      await client.query(
        `UPDATE sensor_sync_checkpoints SET last_success_at=$2,
           processed_through=$3,
           next_sync_at=$4,updated_at=now() WHERE scope_key=$1`,
        [scope, now, positions.rows[0].processed_through,
          new Date(now.getTime() + 5 * 60_000)],
      );
      await client.query('COMMIT');
      return processed;
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }

  private async readPoints(farm: Farm, device: Device, start: Date, now: Date): Promise<Point[]> {
    const rows = await this.influx.client.getQueryApi(this.influx.org).collectRows<Point>(
      `from(bucket: ${JSON.stringify(this.influx.bucket)})
       |> range(start: time(v: ${JSON.stringify(start.toISOString())}),
         stop: time(v: ${JSON.stringify(new Date(now.getTime() + 1).toISOString())}))
       |> filter(fn: (r) => r._measurement == "sensor_readings"
         and r.farm_id == ${JSON.stringify(farm.public_id)}
         and r.pond_id == ${JSON.stringify(device.pond_public_id)}
         and r.device_id == ${JSON.stringify(device.device_id)}
         and r.parameter == ${JSON.stringify(device.parameter)}
         and (r._field == "value" or r._field == "validity" or r._field == "event_id"))
       |> pivot(rowKey: ["_time"], columnKey: ["_field"], valueColumn: "_value")
       |> sort(columns: ["_time"])`,
    );
    return rows.filter((row) => row._time && Number.isFinite(Date.parse(row._time)))
      .sort((a, b) => Date.parse(a._time!) - Date.parse(b._time!));
  }

  private async readLatestValid(farm: Farm): Promise<Map<string, Date>> {
    const rows = await this.influx.client.getQueryApi(this.influx.org).collectRows<LastValid>(
      `from(bucket: ${JSON.stringify(this.influx.bucket)})
       |> range(start: 0)
       |> filter(fn: (r) => r._measurement == "sensor_readings"
         and r.farm_id == ${JSON.stringify(farm.public_id)}
         and r._field == "validity" and r._value == "valid")
       |> group(columns: ["pond_id", "device_id"]) |> last()`,
    );
    const result = new Map<string, Date>();
    for (const row of rows) {
      if (!row.pond_id || !row.device_id || !row._time) continue;
      const at = new Date(row._time);
      if (!Number.isFinite(at.getTime())) continue;
      const key = `${row.pond_id}:${row.device_id}`;
      if (!result.has(key) || result.get(key)! < at) result.set(key, at);
    }
    return result;
  }

  private async processOffline(client: PoolClient, farm: Farm, device: Device,
    last: Date, now: Date): Promise<void> {
    await client.query(
      `INSERT INTO sensor_offline_states (pond_id,device_id)
       VALUES ($1,$2) ON CONFLICT DO NOTHING`, [device.pond_id, device.id],
    );
    const locked = await client.query<OfflineState>(
      `SELECT id,current_alert_id,episode_no,offline_active
       FROM sensor_offline_states WHERE pond_id=$1 AND device_id=$2 FOR UPDATE`,
      [device.pond_id, device.id],
    );
    const state = locked.rows[0];
    const offlineMs = (farm.sensor_offline_after_minutes ?? 60) * 60_000;
    if (now.getTime() - last.getTime() > offlineMs && !state.offline_active) {
      const occurred = new Date(last.getTime() + offlineMs);
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO alerts
           (public_id,pond_id,device_id,parameter,severity,occurred_at,telemetry_from,
            detection_source)
         VALUES ($1,$2,$3,'sensor_offline','attention',$4,$4,'periodic') RETURNING id`,
        [`ALT-${randomUUID()}`, device.pond_id, device.id, occurred],
      );
      const alertId = inserted.rows[0].id;
      await client.query(
        `INSERT INTO issues
           (public_id,farm_id,pond_id,issue_type,parameter,severity,trend,
            state,source_type,source_id,since)
         VALUES ($1,$2,$3,'sensor','sensor_offline','attention','stable',
           'ongoing','alert',$4,$5)`,
        [`ISS-${randomUUID()}`, farm.id, device.pond_id, alertId, occurred],
      );
      await client.query(
        `UPDATE sensor_offline_states SET current_alert_id=$2,episode_no=episode_no+1,
           offline_active=true,last_seen_at=$3,last_checked_at=$4 WHERE id=$1`,
        [state.id, alertId, last, now],
      );
    } else if (now.getTime() - last.getTime() <= offlineMs && state.offline_active) {
      await client.query(
        `UPDATE alerts SET telemetry_to=$2 WHERE id=$1 AND telemetry_to IS NULL`,
        [state.current_alert_id, last],
      );
      await client.query(
        `UPDATE sensor_offline_states SET current_alert_id=NULL,offline_active=false,
           last_seen_at=$2,last_checked_at=$3 WHERE id=$1`, [state.id, last, now],
      );
    } else {
      await client.query(
        `UPDATE sensor_offline_states SET last_seen_at=$2,last_checked_at=$3 WHERE id=$1`,
        [state.id, last, now],
      );
    }
  }

  private async ensureStates(client: PoolClient, device: Device): Promise<void> {
    for (const direction of ['high', 'low']) await client.query(
      `INSERT INTO alert_detection_states (pond_id,device_id,parameter,direction)
       VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`,
      [device.pond_id, device.id, device.parameter, direction],
    );
  }

  private async processSide(client: PoolClient, farm: Farm, device: Device, state: State,
    at: Date, now: Date, value: number, threshold: Threshold, setId: string | null): Promise<void> {
    if (state.periodic_measured_through && at <= state.periodic_measured_through) return;
    const { severity, boundary } = sideSeverity(value, threshold, state.direction);
    // A missing 3–5 minute sample cannot silently extend an Attention streak.
    const gapMs = Math.min(farm.sensor_delayed_after_minutes ?? 15, 6) * 60_000;
    const started = severity === 'normal' ? null
      : anomalyStart(state.periodic_anomaly_started_at,
        state.periodic_measured_through, at, gapMs);
    let alert: Alert | null = null;
    if (state.current_alert_id) {
      const result = await client.query<Alert>(
        `SELECT id,state,severity,occurred_at FROM alerts WHERE id=$1 FOR UPDATE`,
        [state.current_alert_id],
      );
      alert = result.rows[0] ?? null;
    }
    if (severity === 'normal') {
      if (alert && at >= alert.occurred_at
        && (!state.critical_active || !state.live_measured_through
          || at >= state.live_measured_through)) {
        await client.query(
          `UPDATE sensor_anomaly_intervals SET ended_at=$2,updated_at=now()
           WHERE alert_id=$1 AND ended_at IS NULL AND started_at <= $2`, [alert.id, at],
        );
        await client.query(
          `UPDATE alerts SET telemetry_to=$2 WHERE id=$1 AND telemetry_to IS NULL`,
          [alert.id, at],
        );
        state.current_alert_id = null;
        state.critical_active = false;
      }
    } else if (severity !== 'critical' && boundary !== null && started
      && (!alert || at >= alert.occurred_at)) {
      const fresh = now.getTime() - at.getTime()
        <= (farm.sensor_offline_after_minutes ?? 60) * 60_000;
      const shouldAlert = fresh && (severity === 'warning'
        || at.getTime() - started.getTime()
          >= (farm.attention_to_alert_minutes ?? 30) * 60_000);
      if (shouldAlert) {
        if (!alert || alert.state === 'resolved') {
          if (alert) {
            await client.query(
              `UPDATE sensor_anomaly_intervals SET ended_at=$2,updated_at=now()
               WHERE alert_id=$1 AND ended_at IS NULL AND started_at <= $2`, [alert.id, at],
            );
            await client.query(
              `UPDATE alerts SET telemetry_to=$2 WHERE id=$1 AND telemetry_to IS NULL`,
              [alert.id, at],
            );
          }
          state.current_alert_id = await this.createAlert(client, farm, device,
            state, severity, at, value, boundary, threshold.unit, setId, started);
          state.episode_no = (BigInt(state.episode_no) + 1n).toString();
        } else if (alert.severity !== 'critical') {
          const promote = alert.severity === 'attention' && severity === 'warning';
          if (promote) {
            await client.query(
              `UPDATE alerts SET severity='warning',observed_value=$2,
                 threshold_value=$3,threshold_set_id=$4,unit=$5 WHERE id=$1`,
              [alert.id, value, boundary, setId, threshold.unit],
            );
            await client.query(`UPDATE issues SET severity='warning'
              WHERE source_type='alert' AND source_id=$1`, [alert.id]);
            await client.query(`UPDATE sensor_anomaly_intervals SET severity='warning',
              updated_at=now() WHERE alert_id=$1 AND ended_at IS NULL`, [alert.id]);
          }
          await client.query(
            `UPDATE sensor_anomaly_intervals SET extreme_value=
               CASE WHEN $3='low' THEN LEAST(extreme_value,$2)
                 ELSE GREATEST(extreme_value,$2) END,updated_at=now()
             WHERE alert_id=$1 AND ended_at IS NULL`,
            [alert.id, value, state.direction],
          );
        }
      }
    }
    await client.query(
      `UPDATE alert_detection_states SET periodic_measured_through=$2,
         periodic_severity=$3,periodic_anomaly_started_at=$4,
         current_alert_id=$5,episode_no=$6,critical_active=$7,updated_at=now()
       WHERE id=$1`,
      [state.id, at, severity, started, state.current_alert_id,
        state.episode_no, state.critical_active],
    );
    state.periodic_measured_through = at;
    state.periodic_severity = severity;
    state.periodic_anomaly_started_at = started;
  }

  private async createAlert(client: PoolClient, farm: Farm, device: Device, state: State,
    severity: 'attention' | 'warning', at: Date, value: number, boundary: number,
    unit: string, setId: string | null, started: Date): Promise<string> {
    const nextEpisode = (BigInt(state.episode_no) + 1n).toString();
    const alert = await client.query<{ id: string }>(
      `INSERT INTO alerts
         (public_id,pond_id,device_id,parameter,severity,observed_value,
          threshold_value,unit,direction,threshold_set_id,occurred_at,
          telemetry_from,detection_state_id,episode_no,detection_source)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'periodic')
       RETURNING id`,
      [`ALT-${randomUUID()}`, device.pond_id, device.id, device.parameter,
        severity, value, boundary, unit,
        state.direction === 'low' ? 'below' : 'above', setId, at, started,
        state.id, nextEpisode],
    );
    const id = alert.rows[0].id;
    await client.query(
      `INSERT INTO sensor_anomaly_intervals
         (pond_id,device_id,parameter,kind,severity,unit,started_at,
          extreme_value,threshold_set_id,alert_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [device.pond_id, device.id, device.parameter,
        state.direction === 'low' ? 'below_threshold' : 'above_threshold',
        severity, unit, started, value, setId, id],
    );
    await client.query(
      `INSERT INTO issues
         (public_id,farm_id,pond_id,issue_type,parameter,severity,trend,
          state,source_type,source_id,since)
       VALUES ($1,$2,$3,'water_quality',$4,$5,$6,'ongoing','alert',$7,$8)`,
      [`ISS-${randomUUID()}`, farm.id, device.pond_id, device.parameter, severity,
        state.direction === 'low' ? 'decreasing' : 'increasing', id, started],
    );
    return id;
  }
}
