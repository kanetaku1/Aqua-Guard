import { Injectable } from '@nestjs/common';
import { InfluxDB, QueryApi } from '@influxdata/influxdb-client';
import { ApiProblem } from '../http/problem';
import { InfluxService } from './influx.service';
import { PostgresService } from './postgres.service';
import { SensorIngestionService } from './sensor-ingestion.service';
import { SensorParameter, SensorReading } from './sensor-reading';

const EVENT_PREFIX = 'src:';
const OVERLAP_MS = 2 * 60_000;

interface SourceRow { _time?: string; _field?: string; _value?: number }
interface TargetDevice {
  deviceId: string; parameter: SensorParameter; farmId: string; pondId: string;
  assignedAt: Date; invalid: boolean;
}
export interface SourceSyncResult {
  rows: number; stored: number; duplicate: number; invalid: number; rejected: number;
}

function parseFieldMap(raw: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const pair of raw.split(',').map((item) => item.trim()).filter(Boolean)) {
    const [field, deviceId] = pair.split(':').map((item) => item.trim());
    if (!field || !deviceId) throw new Error(`SOURCE_INFLUX_FIELD_MAP entry is invalid: ${pair}`);
    map.set(field, deviceId);
  }
  if (map.size === 0) throw new Error('SOURCE_INFLUX_FIELD_MAP must map at least one field');
  return map;
}

function positiveNumber(name: string, fallback: number): number {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${name} must be a positive number`);
  return value;
}

/**
 * Copies readings from an existing InfluxDB (one measurement, one field per sensor)
 * into the local sensor_readings series. Valid fields go through SensorIngestionService
 * so receipts, deduplication and Critical evaluation behave as for MQTT events;
 * fields listed in SOURCE_INFLUX_INVALID_FIELDS are kept with validity "invalid".
 */
@Injectable()
export class SourceInfluxSyncService {
  constructor(
    private readonly postgres: PostgresService,
    private readonly influx: InfluxService,
    private readonly ingestion: SensorIngestionService,
  ) {}

  static enabled(): boolean {
    return Boolean(process.env.SOURCE_INFLUX_URL?.trim());
  }

  async runOnce(now = new Date()): Promise<SourceSyncResult> {
    const { source, bucket, measurement } = this.sourceConfig();
    const fieldMap = parseFieldMap(process.env.SOURCE_INFLUX_FIELD_MAP ?? '');
    const invalidFields = new Set((process.env.SOURCE_INFLUX_INVALID_FIELDS ?? '')
      .split(',').map((item) => item.trim()).filter(Boolean));
    const backfillMs = positiveNumber('SOURCE_INFLUX_BACKFILL_HOURS', 168) * 3_600_000;
    const devices = await this.targetDevices(fieldMap, invalidFields);
    const resumeAt = await this.resumeTimes(devices, new Date(now.getTime() - backfillMs));
    const start = new Date(Math.min(...resumeAt.values()));

    const fields = [...devices.keys()];
    const rows = await source.collectRows<SourceRow>(
      `from(bucket: ${JSON.stringify(bucket)})
       |> range(start: time(v: ${JSON.stringify(start.toISOString())}),
         stop: time(v: ${JSON.stringify(now.toISOString())}))
       |> filter(fn: (r) => r._measurement == ${JSON.stringify(measurement)}
         and contains(value: r._field, set: ${JSON.stringify(fields)}))
       |> group()
       |> sort(columns: ["_time"])`,
    );

    const result: SourceSyncResult = { rows: rows.length, stored: 0, duplicate: 0, invalid: 0, rejected: 0 };
    const invalidReadings: SensorReading[] = [];
    for (const row of rows) {
      const device = row._field ? devices.get(row._field) : undefined;
      const at = new Date(row._time ?? '');
      if (!device || typeof row._value !== 'number' || !Number.isFinite(row._value)
        || !Number.isFinite(at.getTime()) || at < device.assignedAt) {
        result.rejected += 1;
        continue;
      }
      if (at.getTime() < resumeAt.get(device.deviceId)!) continue;
      // Date keeps millisecond precision, which the ingestion contract requires.
      const measuredAt = at;
      const eventId = `${EVENT_PREFIX}${device.deviceId}:${measuredAt.getTime()}`;
      if (device.invalid) {
        invalidReadings.push({ farmId: device.farmId, pondId: device.pondId,
          deviceId: device.deviceId, parameter: device.parameter, value: row._value,
          measuredAt, receivedAt: now, validity: 'invalid',
          qualityReason: 'source_marked_invalid', eventId });
        if (invalidReadings.length >= 500) {
          await this.influx.writeSensorReadings(invalidReadings.splice(0));
          result.invalid += 500;
        }
        continue;
      }
      try {
        const saved = await this.ingestion.ingest({ eventId, deviceId: device.deviceId,
          parameter: device.parameter, value: row._value, measuredAt: measuredAt.toISOString() });
        if (saved.duplicate) result.duplicate += 1; else result.stored += 1;
      } catch (error) {
        // Storage outages abort the run; the next run resumes from the stored checkpoint.
        if (error instanceof ApiProblem && error.getStatus() !== 503) result.rejected += 1;
        else throw error;
      }
    }
    if (invalidReadings.length) {
      await this.influx.writeSensorReadings(invalidReadings);
      result.invalid += invalidReadings.length;
    }
    return result;
  }

  private sourceConfig(): { source: QueryApi; bucket: string; measurement: string } {
    const url = process.env.SOURCE_INFLUX_URL?.trim();
    const token = process.env.SOURCE_INFLUX_TOKEN;
    const org = process.env.SOURCE_INFLUX_ORG;
    const bucket = process.env.SOURCE_INFLUX_BUCKET;
    if (!url || !token || !org || !bucket) {
      throw new Error('SOURCE_INFLUX_URL, SOURCE_INFLUX_TOKEN, SOURCE_INFLUX_ORG and SOURCE_INFLUX_BUCKET must be set');
    }
    return {
      source: new InfluxDB({ url, token, timeout: 120_000 }).getQueryApi(org),
      bucket,
      measurement: process.env.SOURCE_INFLUX_MEASUREMENT ?? 'water_quality',
    };
  }

  private async targetDevices(
    fieldMap: Map<string, string>, invalidFields: Set<string>,
  ): Promise<Map<string, TargetDevice>> {
    const found = await this.postgres.pool.query<{
      device_id: string; parameter: SensorParameter; farm_id: string; pond_id: string;
      assigned_at: Date;
    }>(
      `SELECT d.device_id, d.parameter, f.public_id AS farm_id, p.public_id AS pond_id,
         a.assigned_at
       FROM devices d JOIN device_assignments a ON a.device_id = d.id AND a.unassigned_at IS NULL
       JOIN ponds p ON p.id = a.pond_id JOIN farms f ON f.id = p.farm_id
       WHERE d.device_id = ANY($1) AND d.enabled AND d.type = 'sensor'`,
      [[...fieldMap.values()]],
    );
    const byId = new Map(found.rows.map((row) => [row.device_id, row]));
    const devices = new Map<string, TargetDevice>();
    for (const [field, deviceId] of fieldMap) {
      const row = byId.get(deviceId);
      if (!row) throw new Error(`Sensor ${deviceId} for source field ${field} is not registered, enabled and assigned`);
      devices.set(field, { deviceId, parameter: row.parameter, farmId: row.farm_id,
        pondId: row.pond_id, assignedAt: row.assigned_at, invalid: invalidFields.has(field) });
    }
    return devices;
  }

  /** Per-device resume time: just before the last copied point, or the backfill / assignment start. */
  private async resumeTimes(
    devices: Map<string, TargetDevice>, floor: Date,
  ): Promise<Map<string, number>> {
    const ids = [...devices.values()].map((device) => device.deviceId);
    const latest = await this.influx.client.getQueryApi(this.influx.org).collectRows<{
      _time?: string; device_id?: string;
    }>(
      `import "strings"
       from(bucket: ${JSON.stringify(this.influx.bucket)})
       |> range(start: time(v: ${JSON.stringify(floor.toISOString())}))
       |> filter(fn: (r) => r._measurement == "sensor_readings" and r._field == "event_id"
         and contains(value: r.device_id, set: ${JSON.stringify(ids)})
         and strings.hasPrefix(v: r._value, prefix: ${JSON.stringify(EVENT_PREFIX)}))
       |> group(columns: ["device_id"])
       |> last()`,
    );
    const copied = new Map(latest.map((row) => [row.device_id, Date.parse(row._time ?? '')]));
    const resume = new Map<string, number>();
    for (const device of devices.values()) {
      const checkpoint = copied.get(device.deviceId);
      const from = checkpoint !== undefined && Number.isFinite(checkpoint)
        ? checkpoint - OVERLAP_MS : device.assignedAt.getTime();
      resume.set(device.deviceId, Math.max(from, floor.getTime()));
    }
    return resume;
  }
}
