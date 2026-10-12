import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { PoolClient } from 'pg';
import { AdminThresholdsService, Threshold } from '../admin/admin-thresholds.service';
import { ApiProblem } from '../http/problem';
import { InfluxService } from './influx.service';
import { PostgresService } from './postgres.service';
import { SensorParameter } from './sensor-reading';

const PARAMETERS = new Set<SensorParameter>(
  ['do', 'ph', 'temperature', 'tds', 'turbidity', 'water_level'],
);
type Direction = 'low' | 'high';
interface Reference {
  farmId: string; pondId: string; deviceId: string;
  parameter: SensorParameter; measuredAt: string;
}
interface Receipt {
  id: string; device_id: string; event_id: string; status: string;
  critical_evaluation_status: string; observation_refs: unknown;
}
interface Target {
  pond_uuid: string; farm_uuid: string; device_uuid: string; company_id: string;
  farm_id: string; pond_id: string; device_id: string; parameter: SensorParameter;
  offline_minutes: number | null;
}
interface Point { value?: number; validity?: string; event_id?: string }
interface State {
  id: string; direction: Direction; episode_no: string;
  current_alert_id: string | null; live_measured_through: Date | null;
  periodic_measured_through: Date | null;
}
interface AlertState { id: string; state: string; severity: string }
type Result = { status: 'pending' | 'evaluated' | 'skipped' | 'already_done';
  alertId: string | null };

function reference(value: unknown): Reference | null {
  if (!Array.isArray(value) || value.length !== 1) return null;
  const row = value[0];
  if (!row || typeof row !== 'object' || Array.isArray(row)) return null;
  const item = row as Record<string, unknown>;
  if (typeof item.farmId !== 'string' || typeof item.pondId !== 'string'
    || typeof item.deviceId !== 'string' || typeof item.parameter !== 'string'
    || !PARAMETERS.has(item.parameter as SensorParameter)
    || typeof item.measuredAt !== 'string'
    || !Number.isFinite(Date.parse(item.measuredAt))) return null;
  return item as unknown as Reference;
}
function criticalDirection(value: number, threshold: Threshold): Direction | null {
  if (threshold.criticalLow !== null && value < threshold.criticalLow) return 'low';
  if (threshold.criticalHigh !== null && value > threshold.criticalHigh) return 'high';
  return null;
}
function thresholdValue(direction: Direction, threshold: Threshold): number {
  const value = direction === 'low' ? threshold.criticalLow : threshold.criticalHigh;
  if (value === null) throw new Error('Critical threshold is missing');
  return value;
}

@Injectable()
export class CriticalEvaluationService {
  constructor(
    private readonly postgres: PostgresService,
    private readonly influx: InfluxService,
    private readonly thresholds: AdminThresholdsService,
  ) {}

  private async point(ref: Reference): Promise<Point> {
    const at = new Date(ref.measuredAt);
    let rows: Point[];
    try {
      rows = await this.influx.client.getQueryApi(this.influx.org).collectRows<Point>(
        `from(bucket: ${JSON.stringify(this.influx.bucket)})
         |> range(start: time(v: ${JSON.stringify(ref.measuredAt)}),
           stop: time(v: ${JSON.stringify(new Date(at.getTime() + 1).toISOString())}))
         |> filter(fn: (r) => r._measurement == "sensor_readings"
           and r.farm_id == ${JSON.stringify(ref.farmId)}
           and r.pond_id == ${JSON.stringify(ref.pondId)}
           and r.device_id == ${JSON.stringify(ref.deviceId)}
           and r.parameter == ${JSON.stringify(ref.parameter)}
           and (r._field == "value" or r._field == "event_id" or r._field == "validity"))
         |> pivot(rowKey: ["_time"], columnKey: ["_field"], valueColumn: "_value")`,
      );
    } catch {
      throw new ApiProblem(503, 'storage_unavailable', 'Sensor data is unavailable');
    }
    if (rows.length !== 1 || rows[0].validity !== 'valid'
      || typeof rows[0].value !== 'number' || !Number.isFinite(rows[0].value)) {
      throw new ApiProblem(503, 'stored_point_unavailable', 'Stored sensor point is unavailable');
    }
    return rows[0];
  }

  private async target(client: PoolClient, receipt: Receipt,
    ref: Reference): Promise<Target | null> {
    const result = await client.query<Target>(
      `SELECT p.id AS pond_uuid, f.id AS farm_uuid, d.id AS device_uuid,
         f.company_id,
         f.public_id AS farm_id, p.public_id AS pond_id,
         d.device_id, d.parameter, rules.sensor_offline_after_minutes AS offline_minutes
       FROM devices d JOIN device_assignments a ON a.device_id = d.id
       JOIN ponds p ON p.id = a.pond_id JOIN farms f ON f.id = p.farm_id
       LEFT JOIN operational_rule_versions rules
         ON rules.company_id = f.company_id AND rules.effective_to IS NULL
       WHERE d.id = $1 AND d.enabled AND d.type = 'sensor'
         AND d.parameter = $2 AND a.assigned_at <= $3
         AND (a.unassigned_at IS NULL OR a.unassigned_at > $3)`,
      [receipt.device_id, ref.parameter, ref.measuredAt],
    );
    const row = result.rows[0];
    return row && row.farm_id === ref.farmId && row.pond_id === ref.pondId
      && row.device_id === ref.deviceId ? row : null;
  }

  private async complete(client: PoolClient, receiptId: string, status: 'evaluated' | 'skipped',
    setId: string | null, metadata: Record<string, unknown>): Promise<void> {
    await client.query(
      `UPDATE ingestion_receipts SET status='completed',
         critical_evaluation_status=$2, critical_evaluated_at=now(),
         critical_policy_version_id=$3, evaluation_metadata=$4,
         processed_at=now(), next_retry_at=NULL
       WHERE id=$1`,
      [receiptId, status, setId, JSON.stringify(metadata)],
    );
  }

  private async state(client: PoolClient, pondUuid: string, deviceUuid: string,
    parameter: SensorParameter): Promise<State[]> {
    for (const direction of ['high', 'low'] as const) await client.query(
      `INSERT INTO alert_detection_states (pond_id, device_id, parameter, direction)
       VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`,
      [pondUuid, deviceUuid, parameter, direction],
    );
    const result = await client.query<State>(
      `SELECT id, direction, episode_no, current_alert_id, live_measured_through,
         periodic_measured_through
       FROM alert_detection_states WHERE pond_id=$1 AND device_id=$2 AND parameter=$3
       ORDER BY direction FOR UPDATE`,
      [pondUuid, deviceUuid, parameter],
    );
    return result.rows;
  }

  private async critical(client: PoolClient, target: Target, state: State,
    direction: Direction, at: Date, value: number, threshold: Threshold,
    setId: string | null): Promise<string> {
    let alert: AlertState | undefined;
    if (state.current_alert_id) {
      const existing = await client.query<AlertState>(
        'SELECT id, state, severity FROM alerts WHERE id=$1 FOR UPDATE',
        [state.current_alert_id],
      );
      alert = existing.rows[0];
    }
    const kind = direction === 'low' ? 'below_threshold' : 'above_threshold';
    const boundary = thresholdValue(direction, threshold);
    let alertId: string;
    if (alert && alert.state !== 'resolved') {
      alertId = alert.id;
      if (alert.severity !== 'critical') await client.query(
        `UPDATE alerts SET severity='critical', observed_value=$2,
           threshold_value=$3, threshold_set_id=$4, unit=$5,
           critical_detected_at=COALESCE(critical_detected_at,now()) WHERE id=$1`,
        [alertId, value, boundary, setId, threshold.unit],
      );
      else await client.query(
        `UPDATE alerts SET critical_detected_at=COALESCE(critical_detected_at,now())
         WHERE id=$1`, [alertId],
      );
      const existingInterval = await client.query<{ id: string }>(
        `SELECT id FROM sensor_anomaly_intervals
         WHERE alert_id=$1 AND ended_at IS NULL ORDER BY started_at DESC LIMIT 1 FOR UPDATE`,
        [alertId],
      );
      if (existingInterval.rows[0]) await client.query(
        `UPDATE sensor_anomaly_intervals SET severity='critical',
           extreme_value=CASE WHEN $3='low' THEN LEAST(extreme_value,$2)
             ELSE GREATEST(extreme_value,$2) END,
           updated_at=now() WHERE id=$1`,
        [existingInterval.rows[0].id, value, direction],
      );
      else await this.insertInterval(client, target, alertId, kind, at, value,
        threshold, setId);
      await client.query(
        `UPDATE alert_detection_states SET critical_active=true, updated_at=now()
         WHERE id=$1`, [state.id],
      );
    } else {
      if (alert) await client.query(
        `UPDATE sensor_anomaly_intervals SET ended_at=$2, updated_at=now()
         WHERE alert_id=$1 AND ended_at IS NULL`, [alert.id, at],
      );
      const nextEpisode = BigInt(state.episode_no) + 1n;
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO alerts
           (public_id, pond_id, device_id, parameter, severity, observed_value,
            threshold_value, unit, direction, threshold_set_id, occurred_at,
            telemetry_from, detection_state_id, episode_no, detection_source,
            critical_detected_at)
         VALUES ($1,$2,$3,$4,'critical',$5,$6,$7,$8,$9,$10,$10,$11,$12,
           'ingestion',now()) RETURNING id`,
        [`ALT-${randomUUID()}`, target.pond_uuid, target.device_uuid,
          threshold.parameter, value, boundary, threshold.unit,
          direction === 'low' ? 'below' : 'above', setId, at,
          state.id, nextEpisode.toString()],
      );
      alertId = inserted.rows[0].id;
      await this.insertInterval(client, target, alertId, kind, at, value, threshold, setId);
      await client.query(
        `UPDATE alert_detection_states SET episode_no=$2, current_alert_id=$3,
           critical_active=true, updated_at=now() WHERE id=$1`,
        [state.id, nextEpisode.toString(), alertId],
      );
    }
    await client.query(
      `INSERT INTO issues
         (public_id,farm_id,pond_id,issue_type,parameter,severity,trend,
          state,source_type,source_id,since)
       SELECT $2,$3,a.pond_id,'water_quality',a.parameter,a.severity,
         CASE WHEN a.direction='below' THEN 'decreasing' ELSE 'increasing' END,
         'ongoing','alert',a.id,a.occurred_at
       FROM alerts a WHERE a.id=$1
       ON CONFLICT (source_type,source_id) DO UPDATE SET
         severity=EXCLUDED.severity`,
      [alertId, `ISS-${randomUUID()}`, target.farm_uuid],
    );
    await client.query(
      `INSERT INTO alert_notification_outbox (alert_id, event_kind)
       VALUES ($1,'critical_detected') ON CONFLICT DO NOTHING`, [alertId],
    );
    return alertId;
  }

  private async insertInterval(client: PoolClient, target: Target, alertId: string,
    kind: string, at: Date, value: number, threshold: Threshold,
    setId: string | null): Promise<void> {
    await client.query(
      `INSERT INTO sensor_anomaly_intervals
         (pond_id, device_id, parameter, kind, severity, unit, started_at,
          extreme_value, threshold_set_id, alert_id)
       VALUES ($1,$2,$3,$4,'critical',$5,$6,$7,$8,$9)`,
      [target.pond_uuid, target.device_uuid, threshold.parameter, kind, threshold.unit, at,
        value, setId, alertId],
    );
  }

  async evaluateReceipt(receiptId: string): Promise<Result> {
    const snapshot = await this.postgres.pool.query<Receipt>(
      `SELECT id, device_id, event_id, status, critical_evaluation_status,
         observation_refs FROM ingestion_receipts WHERE id=$1`, [receiptId],
    );
    const initial = snapshot.rows[0];
    if (!initial) throw new ApiProblem(404, 'not_found', 'Receipt not found');
    if (initial.critical_evaluation_status === 'evaluated'
      || initial.critical_evaluation_status === 'skipped') {
      return { status: 'already_done', alertId: null };
    }
    if (initial.status !== 'stored') return { status: 'pending', alertId: null };
    const ref = reference(initial.observation_refs);
    if (!ref) throw new ApiProblem(503, 'receipt_invalid', 'Receipt observation reference is invalid');
    const point = await this.point(ref);
    if (point.event_id !== initial.event_id) {
      throw new ApiProblem(503, 'stored_point_conflict', 'Stored sensor point does not match receipt');
    }
    const at = new Date(ref.measuredAt);
    const client = await this.postgres.pool.connect();
    try {
      await client.query('BEGIN');
      const locked = await client.query<Receipt>(
        `SELECT id, device_id, event_id, status, critical_evaluation_status,
           observation_refs FROM ingestion_receipts WHERE id=$1 FOR UPDATE`, [receiptId],
      );
      const receipt = locked.rows[0];
      if (receipt.critical_evaluation_status === 'evaluated'
        || receipt.critical_evaluation_status === 'skipped') {
        await client.query('COMMIT');
        return { status: 'already_done', alertId: null };
      }
      if (receipt.status !== 'stored') {
        await client.query('COMMIT');
        return { status: 'pending', alertId: null };
      }
      const target = await this.target(client, receipt, ref);
      if (!target) {
        await this.complete(client, receiptId, 'skipped', null,
          { reason: 'device_assignment_invalid' });
        await client.query('COMMIT');
        return { status: 'skipped', alertId: null };
      }
      const policy = await this.thresholds.thresholdAt(
        target.company_id, target.farm_uuid, ref.parameter, at,
      );
      const age = Date.now() - at.getTime();
      if (age < 0 || age > (target.offline_minutes ?? 60) * 60000) {
        await this.complete(client, receiptId, 'skipped', policy.setId,
          { reason: 'stale_input', measuredAt: ref.measuredAt });
        await client.query('COMMIT');
        return { status: 'skipped', alertId: null };
      }
      const states = await this.state(client, target.pond_uuid, receipt.device_id, ref.parameter);
      if (states.some((state) => state.live_measured_through
        && at <= state.live_measured_through)
        || states.some((state) => state.periodic_measured_through
          && at <= state.periodic_measured_through)) {
        await this.complete(client, receiptId, 'skipped', policy.setId,
          { reason: 'out_of_order', measuredAt: ref.measuredAt });
        await client.query('COMMIT');
        return { status: 'skipped', alertId: null };
      }
      const direction = criticalDirection(point.value!, policy.threshold);
      let alertId: string | null = null;
      if (direction) {
        const current = states.find((state) => state.direction === direction)!;
        alertId = await this.critical(client, target, current, direction, at,
          point.value!, policy.threshold, policy.setId);
      }
      for (const state of states) await client.query(
        `UPDATE alert_detection_states SET live_measured_through=$2,
           live_event_id=$3, updated_at=now() WHERE id=$1`,
        [state.id, at, receipt.event_id],
      );
      await this.complete(client, receiptId, 'evaluated', policy.setId,
        { outcome: direction ? 'critical' : 'not_critical', direction, alertId });
      await client.query('COMMIT');
      return { status: 'evaluated', alertId };
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }

  async recoverUnevaluated(): Promise<{ evaluated: number; skipped: number; failed: number }> {
    let cursor = '00000000-0000-0000-0000-000000000000';
    const counts = { evaluated: 0, skipped: 0, failed: 0 };
    while (true) {
      const batch = await this.postgres.pool.query<{ id: string }>(
        `SELECT id FROM ingestion_receipts WHERE status='stored'
           AND critical_evaluation_status IN ('pending','failed')
           AND (next_retry_at IS NULL OR next_retry_at <= now()) AND id > $1
         ORDER BY id LIMIT 100`, [cursor],
      );
      if (!batch.rows.length) return counts;
      for (const row of batch.rows) {
        cursor = row.id;
        try {
          const result = await this.evaluateReceipt(row.id);
          if (result.status === 'evaluated') counts.evaluated += 1;
          if (result.status === 'skipped') counts.skipped += 1;
        } catch (error) {
          counts.failed += 1;
          await this.postgres.pool.query(
            `UPDATE ingestion_receipts SET critical_evaluation_status='failed',
               retry_count=retry_count+1, next_retry_at=now()+interval '5 minutes',
               evaluation_metadata=$2 WHERE id=$1 AND status='stored'
               AND critical_evaluation_status IN ('pending','failed')`,
            [row.id, JSON.stringify({ reason: 'evaluation_failed',
              code: error instanceof ApiProblem ? error.getResponse() : 'internal_error' })],
          );
        }
      }
    }
  }
}
