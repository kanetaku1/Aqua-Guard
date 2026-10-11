import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ApiProblem } from '../http/problem';
import { InfluxService } from './influx.service';
import { PostgresService } from './postgres.service';
import { SensorParameter, SensorReading } from './sensor-reading';
import { CriticalEvaluationService } from './critical-evaluation.service';

const PARAMETERS = new Set<SensorParameter>([
  'do', 'ph', 'temperature', 'tds', 'turbidity', 'water_level',
]);
export interface SensorEvent {
  eventId: string;
  deviceId: string;
  parameter: SensorParameter;
  value: number;
  measuredAt: string;
}
interface DeviceRow {
  id: string; farm_id: string; pond_id: string;
}
interface ReceiptRow {
  id: string; payload_hash: string; status: string; received_at: Date;
}
interface StoredPoint {
  value?: number; event_id?: string; validity?: string;
}
interface ObservationRef {
  farmId: string; pondId: string; deviceId: string;
  parameter: SensorParameter; measuredAt: string;
}

function isObservationRef(value: unknown): value is ObservationRef {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const ref = value as Record<string, unknown>;
  return typeof ref.farmId === 'string' && typeof ref.pondId === 'string'
    && typeof ref.deviceId === 'string' && typeof ref.parameter === 'string'
    && PARAMETERS.has(ref.parameter as SensorParameter)
    && typeof ref.measuredAt === 'string'
    && Number.isFinite(Date.parse(ref.measuredAt));
}

function parseEvent(raw: unknown): SensorEvent {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new ApiProblem(422, 'invalid_sensor_event', 'Sensor event must be an object');
  }
  const event = raw as Record<string, unknown>;
  if (typeof event.eventId !== 'string' || !event.eventId.trim()
    || event.eventId.length > 128 || typeof event.deviceId !== 'string'
    || !event.deviceId.trim() || event.deviceId.length > 128
    || typeof event.parameter !== 'string'
    || !PARAMETERS.has(event.parameter as SensorParameter)
    || typeof event.value !== 'number' || !Number.isFinite(event.value)
    || typeof event.measuredAt !== 'string'
    || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?(?:Z|[+-]\d\d:\d\d)$/.test(event.measuredAt)) {
    throw new ApiProblem(422, 'invalid_sensor_event', 'Sensor event fields are invalid');
  }
  const at = new Date(event.measuredAt);
  if (!Number.isFinite(at.getTime()) || at.getTime() > Date.now()) {
    throw new ApiProblem(422, 'invalid_sensor_event', 'Sensor measurement time is invalid');
  }
  return { eventId: event.eventId, deviceId: event.deviceId,
    parameter: event.parameter as SensorParameter, value: event.value,
    measuredAt: at.toISOString() };
}

@Injectable()
export class SensorIngestionService {
  constructor(
    private readonly postgres: PostgresService,
    private readonly influx: InfluxService,
    private readonly critical: CriticalEvaluationService,
  ) {}

  async recoverPendingFromStorage(): Promise<{ recovered: number; missing: number; quarantined: number }> {
    let cursor = '00000000-0000-0000-0000-000000000000';
    const summary = { recovered: 0, missing: 0, quarantined: 0 };
    while (true) {
      const batch = await this.postgres.pool.query<{
        id: string; event_id: string; observation_refs: unknown;
      }>(
        `SELECT id, event_id, observation_refs FROM ingestion_receipts
         WHERE status = 'pending' AND id > $1 ORDER BY id LIMIT 100`, [cursor],
      );
      if (!batch.rows.length) return summary;
      for (const receipt of batch.rows) {
        cursor = receipt.id;
        const refs = receipt.observation_refs;
        if (!Array.isArray(refs) || refs.length !== 1 || !isObservationRef(refs[0])) {
          summary.missing += 1;
          continue;
        }
        const client = await this.postgres.pool.connect();
        try {
          await client.query('BEGIN');
          const locked = await client.query<{ status: string }>(
            'SELECT status FROM ingestion_receipts WHERE id = $1 FOR UPDATE', [receipt.id],
          );
          if (locked.rows[0]?.status !== 'pending') {
            await client.query('COMMIT');
            continue;
          }
          const points = await this.storedPoints(refs[0]);
          if (points.length === 0) {
            summary.missing += 1;
          } else if (points.length === 1 && points[0].event_id === receipt.event_id
            && typeof points[0].value === 'number' && Number.isFinite(points[0].value)
            && points[0].validity === 'valid') {
            await client.query(
              `UPDATE ingestion_receipts SET status = 'stored', stored_at = now()
               WHERE id = $1`, [receipt.id],
            );
            summary.recovered += 1;
          } else {
            await client.query(
              `UPDATE ingestion_receipts SET status = 'quarantined',
                 evaluation_metadata = '{"reason":"observation_conflict"}'::jsonb
               WHERE id = $1`, [receipt.id],
            );
            summary.quarantined += 1;
          }
          await client.query('COMMIT');
        } catch (error) {
          await client.query('ROLLBACK');
          throw error;
        } finally { client.release(); }
      }
    }
  }

  private async storedPoints(ref: ObservationRef): Promise<StoredPoint[]> {
    const at = new Date(ref.measuredAt);
    try {
      return await this.influx.client.getQueryApi(this.influx.org).collectRows<StoredPoint>(
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
      throw new ApiProblem(503, 'storage_unavailable', 'Sensor storage is unavailable');
    }
  }

  async ingest(raw: unknown): Promise<{ receiptId: string; stored: boolean; duplicate: boolean }> {
    const event = parseEvent(raw);
    const at = new Date(event.measuredAt);
    const device = await this.postgres.pool.query<DeviceRow>(
      `SELECT d.id, f.public_id AS farm_id, p.public_id AS pond_id
       FROM devices d JOIN device_assignments a ON a.device_id = d.id
       JOIN ponds p ON p.id = a.pond_id JOIN farms f ON f.id = p.farm_id
       WHERE d.device_id = $1 AND d.enabled AND d.type = 'sensor' AND d.parameter = $2
         AND a.assigned_at <= $3 AND (a.unassigned_at IS NULL OR a.unassigned_at > $3)`,
      [event.deviceId, event.parameter, at],
    );
    const target = device.rows[0];
    if (!target) throw new ApiProblem(422, 'device_assignment_invalid', 'Sensor assignment is invalid');
    const payloadHash = createHash('sha256').update(JSON.stringify(event)).digest('hex');
    const refs = [{ measurement: 'sensor_readings', farmId: target.farm_id,
      pondId: target.pond_id, deviceId: event.deviceId, parameter: event.parameter,
      measuredAt: event.measuredAt }];
    await this.postgres.pool.query(
      `INSERT INTO ingestion_receipts
         (device_id, event_id, payload_hash, observation_refs, received_at)
       VALUES ($1, $2, $3, $4, now()) ON CONFLICT (device_id, event_id) DO NOTHING`,
      [target.id, event.eventId, payloadHash, JSON.stringify(refs)],
    );
    const client = await this.postgres.pool.connect();
    let inTransaction = false;
    try {
      await client.query('BEGIN');
      inTransaction = true;
      const receipt = await client.query<ReceiptRow>(
        `SELECT id, payload_hash, status, received_at FROM ingestion_receipts
         WHERE device_id = $1 AND event_id = $2 FOR UPDATE`,
        [target.id, event.eventId],
      );
      const saved = receipt.rows[0];
      if (!saved || saved.payload_hash !== payloadHash) {
        throw new ApiProblem(409, 'event_id_conflict', 'Event ID was used for different data');
      }
      // Serialize different event IDs that claim the same physical observation.
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
        [`${target.id}:${event.parameter}:${event.measuredAt}`]);
      if (saved.status === 'stored' || saved.status === 'completed') {
        await client.query('COMMIT');
        inTransaction = false;
        await this.critical.evaluateReceipt(saved.id);
        return { receiptId: saved.id, stored: true, duplicate: true };
      }
      if (saved.status === 'quarantined') {
        throw new ApiProblem(409, 'observation_conflict', 'Observation is quarantined');
      }
      const existing = await this.storedPoints(refs[0]);
      if (existing.length && (existing.length !== 1
        || existing[0].event_id !== event.eventId || existing[0].value !== event.value
        || existing[0].validity !== 'valid')) {
        await client.query(
          `UPDATE ingestion_receipts SET status = 'quarantined',
             evaluation_metadata = '{"reason":"observation_conflict"}'::jsonb
           WHERE id = $1`, [saved.id],
        );
        await client.query('COMMIT');
        inTransaction = false;
        throw new ApiProblem(409, 'observation_conflict', 'Observation already has different data');
      }
      if (existing.length === 0) {
        const reading: SensorReading = {
          farmId: target.farm_id, pondId: target.pond_id,
          deviceId: event.deviceId, parameter: event.parameter, value: event.value,
          measuredAt: at, receivedAt: saved.received_at,
          validity: 'valid', eventId: event.eventId,
        };
        try { await this.influx.writeSensorReadings([reading]); }
        catch { throw new ApiProblem(503, 'storage_unavailable', 'Sensor storage is unavailable'); }
      }
      await client.query(
        `UPDATE ingestion_receipts SET status = 'stored', stored_at = now()
         WHERE id = $1`, [saved.id],
      );
      await client.query('COMMIT');
      inTransaction = false;
      await this.critical.evaluateReceipt(saved.id);
      return { receiptId: saved.id, stored: true, duplicate: existing.length > 0 };
    } catch (error) {
      if (inTransaction) await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
  }
}
