import { Injectable } from '@nestjs/common';
import { InfluxDB } from '@influxdata/influxdb-client';
import { SensorReading, toSensorPoint } from './sensor-reading';
import {
  ActuatorFeedback,
  DeviceHeartbeat,
  toActuatorFeedbackPoint,
  toHeartbeatPoint,
} from './device-telemetry';
import { Point } from '@influxdata/influxdb-client';

@Injectable()
export class InfluxService {
  readonly client: InfluxDB;
  readonly org: string;
  readonly bucket: string;

  constructor() {
    const token = process.env.INFLUXDB_ADMIN_TOKEN;
    if (!token) throw new Error('INFLUXDB_ADMIN_TOKEN must be set');
    const url = process.env.INFLUXDB_URL
      ?? `http://127.0.0.1:${process.env.INFLUXDB_PORT ?? '8086'}`;
    this.org = process.env.INFLUXDB_ORG ?? 'aquaguard';
    this.bucket = process.env.INFLUXDB_BUCKET ?? 'sensor_raw';
    this.client = new InfluxDB({ url, token });
  }

  async checkConnection(): Promise<void> {
    const query = `from(bucket: ${JSON.stringify(this.bucket)}) |> range(start: -1m) |> limit(n: 1)`;
    await this.client.getQueryApi(this.org).collectRows(query);
  }

  async writeSensorReadings(readings: SensorReading[]): Promise<void> {
    await this.writePoints(readings.map(toSensorPoint));
  }

  async writeDeviceHeartbeats(heartbeats: DeviceHeartbeat[]): Promise<void> {
    await this.writePoints(heartbeats.map(toHeartbeatPoint));
  }

  async writeActuatorFeedback(feedback: ActuatorFeedback[]): Promise<void> {
    await this.writePoints(feedback.map(toActuatorFeedbackPoint));
  }

  private async writePoints(points: Point[]): Promise<void> {
    if (points.length === 0) return;
    const writer = this.client.getWriteApi(this.org, this.bucket, 'ns');
    for (const point of points) writer.writePoint(point);
    await writer.close();
  }
}
