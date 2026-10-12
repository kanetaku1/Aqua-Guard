import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ApiProblem } from '../http/problem';
import { InfluxService } from './influx.service';
import { PostgresService } from './postgres.service';

type Kind = 'heartbeat' | 'feedback';
interface Target { farm_id: string; pond_id: string; type: string }
interface Stored { event_id?: string; payload_hash?: string }

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
      `SELECT f.public_id AS farm_id,p.public_id AS pond_id,d.type
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
    const existing = await this.stored(measurement, target, event.deviceId, at);
    if (existing) {
      if (existing.event_id === event.eventId && existing.payload_hash === hash) return;
      throw new ApiProblem(409, 'telemetry_point_conflict', 'Device telemetry point conflicts');
    }
    const common = { farmId: target.farm_id, pondId: target.pond_id,
      deviceId: event.deviceId, receivedAt: new Date(), eventId: event.eventId,
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

  private async stored(measurement: string, target: Target, deviceId: string,
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
