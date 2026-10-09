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
}

export interface ActuatorFeedback extends DeviceTags {
  occurredAt: Date;
  state: 'on' | 'off' | 'fault';
  mode?: string;
  faultCode?: string;
  commandId?: string;
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
  return basePoint('device_heartbeats', heartbeat, heartbeat.sentAt)
    .booleanField('online_hint', heartbeat.onlineHint);
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
  return point;
}
