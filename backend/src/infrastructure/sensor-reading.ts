import { Point } from '@influxdata/influxdb-client';

export type SensorParameter = 'do' | 'ph' | 'temperature' | 'tds' | 'turbidity' | 'water_level';

const SENSOR_PARAMETERS = new Set<SensorParameter>([
  'do', 'ph', 'temperature', 'tds', 'turbidity', 'water_level',
]);

export interface SensorReading {
  farmId: string;
  pondId: string;
  deviceId: string;
  parameter: SensorParameter;
  value: number;
  measuredAt: Date;
  receivedAt: Date;
  validity: string;
  qualityReason?: string;
  eventId?: string;
}

export function toSensorPoint(reading: SensorReading): Point {
  if (!Number.isFinite(reading.value)) throw new Error('Sensor value must be finite');
  if (!Number.isFinite(reading.measuredAt.getTime())) throw new Error('Invalid measuredAt');
  if (!Number.isFinite(reading.receivedAt.getTime())) throw new Error('Invalid receivedAt');
  if (!reading.farmId || !reading.pondId || !reading.deviceId) {
    throw new Error('Farm, Pond and Device IDs are required');
  }
  if (!SENSOR_PARAMETERS.has(reading.parameter)) {
    throw new Error('Unsupported sensor parameter');
  }

  const point = new Point('sensor_readings')
    .tag('farm_id', reading.farmId)
    .tag('pond_id', reading.pondId)
    .tag('device_id', reading.deviceId)
    .tag('parameter', reading.parameter)
    .floatField('value', reading.value)
    .intField('received_at_ns', BigInt(reading.receivedAt.getTime()) * 1_000_000n)
    .stringField('validity', reading.validity)
    .timestamp(reading.measuredAt);

  if (reading.qualityReason) point.stringField('quality_reason', reading.qualityReason);
  if (reading.eventId) point.stringField('event_id', reading.eventId);
  return point;
}
