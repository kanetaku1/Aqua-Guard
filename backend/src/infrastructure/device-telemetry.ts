import { Point } from '@influxdata/influxdb-client';

interface DeviceTags {
  farmId: string;
  pondId: string;
  deviceId: string;
  receivedAt: Date;
}

export interface DeviceHeartbeat extends DeviceTags {
  sentAt: Date;
  onlineHint: boolean;
  eventId?: string;
  payloadHash?: string;
}

export interface ActuatorFeedback extends DeviceTags {
  occurredAt: Date;
  state: 'on' | 'off' | 'fault';
  mode?: string;
  faultCode?: string;
  commandId?: string;
  eventId?: string;
  payloadHash?: string;
}

function basePoint(measurement: string, device: DeviceTags, observedAt: Date): Point {
  if (!device.farmId || !device.pondId || !device.deviceId) {
    throw new Error('Farm, Pond and Device IDs are required');
  }
  if (!Number.isFinite(observedAt.getTime()) || !Number.isFinite(device.receivedAt.getTime())) {
    throw new Error('Invalid telemetry timestamp');
  }
  return new Point(measurement)
    .tag('farm_id', device.farmId)
    .tag('pond_id', device.pondId)
    .tag('device_id', device.deviceId)
    .intField('received_at_ns', BigInt(device.receivedAt.getTime()) * 1_000_000n)
    .timestamp(observedAt);
}

export function toHeartbeatPoint(heartbeat: DeviceHeartbeat): Point {
  const point = basePoint('device_heartbeats', heartbeat, heartbeat.sentAt)
    .booleanField('online_hint', heartbeat.onlineHint);
  if (heartbeat.eventId) point.stringField('event_id', heartbeat.eventId);
  if (heartbeat.payloadHash) point.stringField('payload_hash', heartbeat.payloadHash);
  return point;
}

export function toActuatorFeedbackPoint(feedback: ActuatorFeedback): Point {
  if (!['on', 'off', 'fault'].includes(feedback.state)) {
    throw new Error('Unsupported actuator state');
  }
  const point = basePoint('actuator_feedback', feedback, feedback.occurredAt)
    .stringField('state', feedback.state);
  if (feedback.mode) point.stringField('mode', feedback.mode);
  if (feedback.faultCode) point.stringField('fault_code', feedback.faultCode);
  if (feedback.commandId) point.stringField('command_id', feedback.commandId);
  if (feedback.eventId) point.stringField('event_id', feedback.eventId);
  if (feedback.payloadHash) point.stringField('payload_hash', feedback.payloadHash);
  return point;
}
