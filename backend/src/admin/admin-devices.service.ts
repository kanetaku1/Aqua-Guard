import { Injectable } from '@nestjs/common';
import { PoolClient } from 'pg';
import { ApiProblem } from '../http/problem';
import { InfluxService } from '../infrastructure/influx.service';
import { PostgresService } from '../infrastructure/postgres.service';
import { inputObject, invalid, requiredText } from './admin-input';

type DeviceType = 'sensor' | 'aerator' | 'pump';
type Parameter = 'do' | 'ph' | 'temperature' | 'tds' | 'turbidity' | 'water_level';
type Connection = 'online' | 'offline';
const PARAMETERS: Parameter[] = ['do', 'ph', 'temperature', 'tds', 'turbidity', 'water_level'];
const TYPES: DeviceType[] = ['sensor', 'aerator', 'pump'];

interface DeviceRow {
  id: string; device_id: string; type: DeviceType; parameter: Parameter | null;
  spec: string | null; pond_uuid: string; pond_id: string; pond_name: string;
}
interface LastSeen { at: Date; onlineHint: boolean | null }
export interface AdminDevice {
  deviceId: string; type: DeviceType; pondId: string; parameter: Parameter | null;
  spec: string | null; pond: { id: string; name: string };
  connection: Connection; lastSeenAt: string | null;
}

function parseType(value: unknown): DeviceType {
  if (typeof value !== 'string' || !TYPES.includes(value as DeviceType)) {
    throw invalid('type', 'Must be sensor, aerator or pump');
  }
  return value as DeviceType;
}

function parseDetails(type: DeviceType, parameter: unknown, spec: unknown): {
  parameter: Parameter | null; spec: string | null;
} {
  if (type === 'sensor') {
    if (typeof parameter !== 'string' || !PARAMETERS.includes(parameter as Parameter)) {
      throw invalid('parameter', 'A sensor parameter is required');
    }
    if (spec !== undefined && spec !== null) throw invalid('spec', 'Sensors have no spec');
    return { parameter: parameter as Parameter, spec: null };
  }
  if (parameter !== undefined && parameter !== null) {
    throw invalid('parameter', 'Actuators have no sensor parameter');
  }
  if (spec !== undefined && spec !== null && typeof spec !== 'string') {
    throw invalid('spec', 'Must be text or null');
  }
  return { parameter: null, spec: typeof spec === 'string' ? spec.trim() || null : null };
}

function positiveInt(value: unknown, field: string, fallback: number, maximum?: number): number {
  if (value === undefined) return fallback;
  const parsed = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : NaN;
  if (!Number.isSafeInteger(parsed) || parsed < 1 || (maximum && parsed > maximum)) {
    throw invalid(field, `Must be an integer from 1${maximum ? ` to ${maximum}` : ''}`);
  }
  return parsed;
}

@Injectable()
export class AdminDevicesService {
  constructor(private readonly postgres: PostgresService, private readonly influx: InfluxService) {}

  async list(companyId: string, farmId: string, query: Record<string, unknown>): Promise<{
    page: number; pageSize: number; total: number; items: AdminDevice[];
    counts: { total: number; sensors: number; actuators: number; offline: number };
  }> {
    const page = positiveInt(query.page, 'page', 1);
    const pageSize = positiveInt(query.pageSize, 'pageSize', 20, 100);
    const farm = await this.farmUuid(this.postgres.pool, companyId, farmId);
    if (query.type !== undefined) parseType(query.type);
    if (query.connection !== undefined && query.connection !== 'online' && query.connection !== 'offline') {
      throw invalid('connection', 'Must be online or offline');
    }
    if (query.pondId !== undefined && typeof query.pondId !== 'string') {
      throw invalid('pondId', 'Must be text');
    }
    const result = await this.postgres.pool.query<DeviceRow>(
      `SELECT d.id, d.device_id, d.type, d.parameter, d.spec, p.id AS pond_uuid,
         p.public_id AS pond_id, p.name AS pond_name
       FROM devices d JOIN device_assignments a ON a.device_id = d.id AND a.unassigned_at IS NULL
       JOIN ponds p ON p.id = a.pond_id
       WHERE p.farm_id = $1 AND d.enabled
       ORDER BY lower(p.name), p.public_id,
         CASE d.type WHEN 'sensor' THEN 0 WHEN 'aerator' THEN 1 ELSE 2 END,
         CASE d.parameter WHEN 'do' THEN 0 WHEN 'ph' THEN 1 WHEN 'temperature' THEN 2
           WHEN 'tds' THEN 3 WHEN 'turbidity' THEN 4 ELSE 5 END, d.device_id`, [farm],
    );
    const [seen, offlineMs] = await Promise.all([
      this.lastSeen(farmId), this.offlineAfterMs(companyId),
    ]);
    const all = result.rows.map((row) => this.response(row, seen.get(row.device_id), offlineMs));
    const filtered = all.filter((device) =>
      (query.pondId === undefined || device.pondId === query.pondId)
      && (query.type === undefined || device.type === query.type)
      && (query.connection === undefined || device.connection === query.connection));
    return {
      page, pageSize, total: filtered.length,
      items: filtered.slice((page - 1) * pageSize, page * pageSize),
      counts: {
        total: all.length, sensors: all.filter((d) => d.type === 'sensor').length,
        actuators: all.filter((d) => d.type !== 'sensor').length,
        offline: all.filter((d) => d.connection === 'offline' && d.lastSeenAt !== null).length,
      },
    };
  }

  async create(companyId: string, farmId: string, body: unknown): Promise<AdminDevice> {
    const data = inputObject(body);
    const deviceId = requiredText(data.deviceId, 'deviceId').toUpperCase();
    const type = parseType(data.type);
    const pondId = requiredText(data.pondId, 'pondId');
    const details = parseDetails(type, data.parameter, data.spec);
    const client = await this.postgres.pool.connect();
    try {
      await client.query('BEGIN');
      const farm = await this.farmUuid(client, companyId, farmId);
      const pond = await this.pondUuid(client, farm, pondId);
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO devices (device_id, type, parameter, spec) VALUES ($1, $2, $3, $4)
         RETURNING id`, [deviceId, type, details.parameter, details.spec],
      );
      const id = inserted.rows[0].id;
      const at = new Date();
      await client.query(
        'INSERT INTO device_assignments (device_id, pond_id, assigned_at) VALUES ($1, $2, $3)',
        [id, pond, at],
      );
      await client.query(
        `INSERT INTO device_config_versions (device_id, type, parameter, effective_from)
         VALUES ($1, $2, $3, $4)`, [id, type, details.parameter, at],
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23505') {
        throw new ApiProblem(409, 'device_id_taken', 'Device ID already in use', {
          fieldErrors: [{ field: 'deviceId', message: 'Already in use' }],
        });
      }
      throw error;
    } finally { client.release(); }
    return this.get(companyId, deviceId);
  }

  async update(companyId: string, deviceId: string, body: unknown): Promise<AdminDevice> {
    const data = inputObject(body);
    if (data.deviceId !== undefined) throw invalid('deviceId', 'Device ID cannot be changed');
    const client = await this.postgres.pool.connect();
    try {
      await client.query('BEGIN');
      const current = await client.query<DeviceRow>(
        `SELECT d.id, d.device_id, d.type, d.parameter, d.spec, p.id AS pond_uuid,
           p.public_id AS pond_id, p.name AS pond_name
         FROM devices d JOIN device_assignments a ON a.device_id = d.id AND a.unassigned_at IS NULL
         JOIN ponds p ON p.id = a.pond_id JOIN farms f ON f.id = p.farm_id
         WHERE f.company_id = $1 AND d.device_id = $2 AND d.enabled FOR UPDATE OF d, a`,
        [companyId, deviceId],
      );
      const row = current.rows[0];
      if (!row) throw new ApiProblem(404, 'not_found', 'Device not found');
      const type = data.type === undefined ? row.type : parseType(data.type);
      const details = parseDetails(type,
        data.parameter === undefined ? (type === 'sensor' ? row.parameter : null) : data.parameter,
        data.spec === undefined ? (type === 'sensor' ? null : row.spec) : data.spec);
      let pond = row.pond_uuid;
      if (data.pondId !== undefined) {
        const target = requiredText(data.pondId, 'pondId');
        pond = await this.pondUuidForCompany(client, companyId, target);
      }
      const configChanged = type !== row.type || details.parameter !== row.parameter;
      const deviceChanged = configChanged || details.spec !== row.spec;
      const pondChanged = pond !== row.pond_uuid;
      if (deviceChanged) {
        await client.query(
          `UPDATE devices SET type = $2, parameter = $3, spec = $4, updated_at = now(),
             row_version = row_version + 1 WHERE id = $1`,
          [row.id, type, details.parameter, details.spec],
        );
      }
      if (configChanged || pondChanged) {
        const at = new Date();
        if (configChanged) {
          await client.query(
            'UPDATE device_config_versions SET effective_to = $2 WHERE device_id = $1 AND effective_to IS NULL',
            [row.id, at],
          );
          await client.query(
            `INSERT INTO device_config_versions (device_id, type, parameter, effective_from)
             VALUES ($1, $2, $3, $4)`, [row.id, type, details.parameter, at],
          );
        }
        if (pondChanged) {
          await client.query(
            'UPDATE device_assignments SET unassigned_at = $2 WHERE device_id = $1 AND unassigned_at IS NULL',
            [row.id, at],
          );
          await client.query(
            'INSERT INTO device_assignments (device_id, pond_id, assigned_at) VALUES ($1, $2, $3)',
            [row.id, pond, at],
          );
        }
      }
      await client.query('COMMIT');
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
    return this.get(companyId, deviceId);
  }

  private async get(companyId: string, deviceId: string): Promise<AdminDevice> {
    const result = await this.postgres.pool.query<DeviceRow & { farm_id: string }>(
      `SELECT d.id, d.device_id, d.type, d.parameter, d.spec, p.id AS pond_uuid,
         p.public_id AS pond_id, p.name AS pond_name, f.public_id AS farm_id
       FROM devices d JOIN device_assignments a ON a.device_id = d.id AND a.unassigned_at IS NULL
       JOIN ponds p ON p.id = a.pond_id JOIN farms f ON f.id = p.farm_id
       WHERE f.company_id = $1 AND d.device_id = $2 AND d.enabled`, [companyId, deviceId],
    );
    const row = result.rows[0];
    if (!row) throw new ApiProblem(404, 'not_found', 'Device not found');
    const [seen, offlineMs] = await Promise.all([
      this.lastSeen(row.farm_id), this.offlineAfterMs(companyId),
    ]);
    return this.response(row, seen.get(row.device_id), offlineMs);
  }

  async onlineDeviceIds(companyId: string, farmId: string): Promise<Set<string>> {
    const [seen, offlineMs] = await Promise.all([
      this.lastSeen(farmId), this.offlineAfterMs(companyId),
    ]);
    return new Set([...seen].filter(([, item]) => this.isOnline(item, offlineMs))
      .map(([deviceId]) => deviceId));
  }

  private response(row: DeviceRow, seen: LastSeen | undefined, offlineMs: number): AdminDevice {
    const online = this.isOnline(seen, offlineMs);
    return {
      deviceId: row.device_id, type: row.type, pondId: row.pond_id,
      parameter: row.parameter, spec: row.spec,
      pond: { id: row.pond_id, name: row.pond_name },
      connection: online ? 'online' : 'offline', lastSeenAt: seen?.at.toISOString() ?? null,
    };
  }

  private isOnline(seen: LastSeen | undefined, offlineMs: number): boolean {
    return !!seen && Date.now() - seen.at.getTime() <= offlineMs && seen.onlineHint !== false;
  }

  private async offlineAfterMs(companyId: string): Promise<number> {
    const rules = await this.postgres.pool.query<{ sensor_offline_after_minutes: number }>(
      `SELECT sensor_offline_after_minutes FROM operational_rule_versions
       WHERE company_id = $1 AND effective_to IS NULL`, [companyId],
    );
    return (rules.rows[0]?.sensor_offline_after_minutes ?? 60) * 60 * 1000;
  }

  private async lastSeen(farmId: string): Promise<Map<string, LastSeen>> {
    const sources = [
      { measurement: 'sensor_readings', field: 'value' },
      { measurement: 'device_heartbeats', field: 'online_hint' },
      { measurement: 'actuator_feedback', field: 'state' },
    ];
    const queryApi = this.influx.client.getQueryApi(this.influx.org);
    const groups = await Promise.all(sources.map(({ measurement, field }) =>
      queryApi.collectRows<{ device_id?: string; _time?: string; _value?: unknown }>(
        `from(bucket: ${JSON.stringify(this.influx.bucket)})
         |> range(start: 0)
         |> filter(fn: (r) => r._measurement == ${JSON.stringify(measurement)}
           and r._field == ${JSON.stringify(field)} and r.farm_id == ${JSON.stringify(farmId)})
         |> group(columns: ["device_id"]) |> last()`,
      )));
    const latest = new Map<string, LastSeen>();
    groups.forEach((rows, index) => rows.forEach((row) => {
      if (!row.device_id || !row._time) return;
      const at = new Date(row._time);
      if (!Number.isFinite(at.getTime())) return;
      const current = latest.get(row.device_id);
      if (!current || at >= current.at) {
        latest.set(row.device_id, {
          at, onlineHint: index === 1 ? row._value === true : null,
        });
      }
    }));
    return latest;
  }

  private async farmUuid(client: Pick<PoolClient, 'query'>, companyId: string, farmId: string): Promise<string> {
    const result = await client.query<{ id: string }>(
      'SELECT id FROM farms WHERE company_id = $1 AND public_id = $2', [companyId, farmId],
    );
    if (!result.rows[0]) throw new ApiProblem(404, 'not_found', 'Farm not found');
    return result.rows[0].id;
  }

  private async pondUuid(client: Pick<PoolClient, 'query'>, farm: string, pondId: string): Promise<string> {
    const result = await client.query<{ id: string }>(
      'SELECT id FROM ponds WHERE farm_id = $1 AND public_id = $2', [farm, pondId],
    );
    if (!result.rows[0]) throw invalid('pondId', 'Pond is not in this Farm');
    return result.rows[0].id;
  }

  private async pondUuidForCompany(client: Pick<PoolClient, 'query'>, company: string, pondId: string): Promise<string> {
    const result = await client.query<{ id: string }>(
      `SELECT p.id FROM ponds p JOIN farms f ON f.id = p.farm_id
       WHERE f.company_id = $1 AND p.public_id = $2`, [company, pondId],
    );
    if (!result.rows[0]) throw invalid('pondId', 'Pond is not in this Company');
    return result.rows[0].id;
  }
}
