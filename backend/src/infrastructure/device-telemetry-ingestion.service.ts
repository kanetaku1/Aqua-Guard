import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ApiProblem } from '../http/problem';
import { InfluxService } from './influx.service';
import { PostgresService } from './postgres.service';

type Kind = 'heartbeat' | 'feedback';
interface Target { id: string; farm_id: string; pond_id: string; type: string }
interface Stored { event_id?: string; payload_hash?: string }
interface Receipt {
  id: string; payload_hash: string; status: string; received_at: Date;
}

function textField(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 128;
}

function eventTime(value: unknown): Date {
  if (typeof value !== 'string'
    || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?(?:Z|[+-]\d\d:\d\d)$/.test(value)) {
    throw new ApiProblem(422, 'invalid_device_telemetry', 'Telemetry time is invalid');
  }
  const at = new Date(value);
  if (!Number.isFinite(at.getTime()) || at.getTime() > Date.now()) {
    throw new ApiProblem(422, 'invalid_device_telemetry', 'Telemetry time is invalid');
  }
  return at;
}

@Injectable()
export class DeviceTelemetryIngestionService {
  constructor(
    private readonly postgres: PostgresService,
    private readonly influx: InfluxService,
  ) {}

  async recoverPendingFromStorage(): Promise<{ recovered: number; missing: number;
    quarantined: number }> {
    const result = { recovered: 0, missing: 0, quarantined: 0 };
    let cursor = '00000000-0000-0000-0000-000000000000';
    while (true) {
      const batch = await this.postgres.pool.query<{
        id: string; event_id: string; payload_hash: string; kind: Kind;
        observed_at: Date; farm_public_id: string; pond_public_id: string;
        device_public_id: string;
      }>(
        `SELECT r.id,r.event_id,r.payload_hash,r.kind,r.observed_at,
           r.farm_public_id,r.pond_public_id,d.device_id AS device_public_id
         FROM device_telemetry_receipts r JOIN devices d ON d.id=r.device_id
         WHERE r.status='pending' AND r.id>$1 ORDER BY r.id LIMIT 100`, [cursor],
      );
      if (!batch.rows.length) return result;
      for (const receipt of batch.rows) {
        cursor = receipt.id;
        const client = await this.postgres.pool.connect();
        try {
          await client.query('BEGIN');
          const locked = await client.query<{ status: string }>(
            'SELECT status FROM device_telemetry_receipts WHERE id=$1 FOR UPDATE', [receipt.id],
          );
          if (locked.rows[0]?.status !== 'pending') {
            await client.query('COMMIT');
            continue;
          }
          const measurement = receipt.kind === 'heartbeat'
            ? 'device_heartbeats' : 'actuator_feedback';
          const point = await this.stored(measurement,
            { farm_id: receipt.farm_public_id, pond_id: receipt.pond_public_id },
            receipt.device_public_id, receipt.observed_at);
          if (!point) result.missing++;
          else if (point.event_id === receipt.event_id
            && point.payload_hash === receipt.payload_hash) {
            await client.query(`UPDATE device_telemetry_receipts
              SET status='stored',stored_at=now() WHERE id=$1`, [receipt.id]);
            result.recovered++;
          } else {
            await client.query(`UPDATE device_telemetry_receipts
              SET status='quarantined' WHERE id=$1`, [receipt.id]);
            result.quarantined++;
          }
          await client.query('COMMIT');
        } catch (error) {
          await client.query('ROLLBACK');
          throw error;
        } finally { client.release(); }
      }
    }
  }

  async ingest(kind: Kind, raw: unknown): Promise<void> {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      throw new ApiProblem(422, 'invalid_device_telemetry', 'Telemetry must be an object');
    }
    const event = raw as Record<string, unknown>;
    if (!textField(event.eventId) || !textField(event.deviceId)) {
      throw new ApiProblem(422, 'invalid_device_telemetry', 'Telemetry identifiers are invalid');
    }
    const at = eventTime(kind === 'heartbeat' ? event.sentAt : event.occurredAt);
    if (kind === 'heartbeat' && typeof event.onlineHint !== 'boolean') {
      throw new ApiProblem(422, 'invalid_device_telemetry', 'Heartbeat state is invalid');
    }
    if (kind === 'feedback' && (!['on', 'off', 'fault'].includes(String(event.state))
      || (event.mode !== undefined && !['auto', 'manual'].includes(String(event.mode)))
      || (event.faultCode !== undefined && !textField(event.faultCode))
      || (event.commandId !== undefined && !textField(event.commandId)))) {
      throw new ApiProblem(422, 'invalid_device_telemetry', 'Actuator feedback is invalid');
    }
    const device = await this.postgres.pool.query<Target>(
      `SELECT d.id,f.public_id AS farm_id,p.public_id AS pond_id,d.type
       FROM devices d JOIN device_assignments a ON a.device_id=d.id
       JOIN ponds p ON p.id=a.pond_id JOIN farms f ON f.id=p.farm_id
       WHERE d.device_id=$1 AND d.enabled
         AND a.assigned_at <= $2 AND (a.unassigned_at IS NULL OR a.unassigned_at > $2)`,
      [event.deviceId, at],
    );
    const target = device.rows[0];
    if (!target || (kind === 'feedback' && !['aerator', 'pump'].includes(target.type))) {
      throw new ApiProblem(422, 'device_assignment_invalid', 'Device assignment is invalid');
    }
    const hash = createHash('sha256').update(JSON.stringify({
      kind, eventId: event.eventId, deviceId: event.deviceId,
      observedAt: at.toISOString(), value: kind === 'heartbeat' ? event.onlineHint : event.state,
      mode: kind === 'feedback' ? event.mode ?? null : null,
      faultCode: kind === 'feedback' ? event.faultCode ?? null : null,
      commandId: kind === 'feedback' ? event.commandId ?? null : null,
    })).digest('hex');
    const measurement = kind === 'heartbeat' ? 'device_heartbeats' : 'actuator_feedback';
    await this.postgres.pool.query(
      `INSERT INTO device_telemetry_receipts
         (device_id,kind,event_id,payload_hash,observed_at,farm_public_id,pond_public_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (device_id,kind,event_id) DO NOTHING`,
      [target.id, kind, event.eventId, hash, at, target.farm_id, target.pond_id],
    );
    const client = await this.postgres.pool.connect();
    let inTransaction = false;
    try {
      await client.query('BEGIN');
      inTransaction = true;
      const saved = (await client.query<Receipt>(
        `SELECT id,payload_hash,status,received_at FROM device_telemetry_receipts
         WHERE device_id=$1 AND kind=$2 AND event_id=$3 FOR UPDATE`,
        [target.id, kind, event.eventId],
      )).rows[0];
      if (!saved || saved.payload_hash !== hash) {
        throw new ApiProblem(409, 'event_id_conflict', 'Event ID was used for different data');
      }
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',
        [`${target.id}:${kind}:${at.toISOString()}`]);
      if (saved.status === 'stored') {
        await client.query('COMMIT');
        inTransaction = false;
        return;
      }
      if (saved.status === 'quarantined') {
        throw new ApiProblem(409, 'telemetry_point_conflict', 'Device telemetry is quarantined');
      }
      const existing = await this.stored(measurement, target, event.deviceId, at);
      if (existing && (existing.event_id !== event.eventId
        || existing.payload_hash !== hash)) {
        await client.query(`UPDATE device_telemetry_receipts SET status='quarantined'
          WHERE id=$1`, [saved.id]);
        await client.query('COMMIT');
        inTransaction = false;
        throw new ApiProblem(409, 'telemetry_point_conflict', 'Device telemetry point conflicts');
      }
      if (!existing) {
        const common = { farmId: target.farm_id, pondId: target.pond_id,
          deviceId: event.deviceId, receivedAt: saved.received_at, eventId: event.eventId,
          payloadHash: hash };
        try {
          if (kind === 'heartbeat') {
            await this.influx.writeDeviceHeartbeats([{ ...common, sentAt: at,
              onlineHint: event.onlineHint as boolean }]);
          } else {
            await this.influx.writeActuatorFeedback([{ ...common, occurredAt: at,
              state: event.state as 'on' | 'off' | 'fault',
              mode: event.mode as string | undefined,
              faultCode: event.faultCode as string | undefined,
              commandId: event.commandId as string | undefined }]);
          }
        } catch {
          throw new ApiProblem(503, 'storage_unavailable', 'Device telemetry storage is unavailable');
        }
      }
      await client.query(`UPDATE device_telemetry_receipts SET status='stored',stored_at=now()
        WHERE id=$1`, [saved.id]);
      await client.query('COMMIT');
      inTransaction = false;
    } catch (error) {
      if (inTransaction) await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
  }

  private async stored(measurement: string,
    target: Pick<Target, 'farm_id' | 'pond_id'>, deviceId: string,
    at: Date): Promise<Stored | null> {
    try {
      const rows = await this.influx.client.getQueryApi(this.influx.org).collectRows<Stored>(
        `from(bucket: ${JSON.stringify(this.influx.bucket)})
         |> range(start: time(v: ${JSON.stringify(at.toISOString())}),
           stop: time(v: ${JSON.stringify(new Date(at.getTime() + 1).toISOString())}))
         |> filter(fn: (r) => r._measurement == ${JSON.stringify(measurement)}
           and r.farm_id == ${JSON.stringify(target.farm_id)}
           and r.pond_id == ${JSON.stringify(target.pond_id)}
           and r.device_id == ${JSON.stringify(deviceId)}
           and (r._field == "event_id" or r._field == "payload_hash" or r._field == "state"
             or r._field == "online_hint"))
         |> pivot(rowKey: ["_time"], columnKey: ["_field"], valueColumn: "_value")`,
      );
      return rows[0] ?? null;
    } catch {
      throw new ApiProblem(503, 'storage_unavailable', 'Device telemetry storage is unavailable');
    }
  }
}
