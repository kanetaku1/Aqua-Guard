import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { PostgresService } from '../infrastructure/postgres.service';
import { ApiProblem } from '../http/problem';
import {
  GeoPoint, inputObject, invalid, optionalEnum, optionalLocation, positiveNumber, requiredText,
} from './admin-input';
import { AdminDevicesService } from './admin-devices.service';

type FarmStatus = 'active' | 'inactive';
type PondStatus = 'in_operation' | 'fallow';
type TimeZone = 'Asia/Jakarta' | 'Asia/Makassar' | 'Asia/Jayapura';

interface FarmRow {
  id: string;
  public_id: string;
  name: string;
  location: string;
  time_zone: TimeZone;
  status: FarmStatus;
  updated_at: Date;
  updated_by_id: string | null;
  updated_by_name: string | null;
  pond_count: string;
  ponds_in_operation: string;
}

export interface AdminFarm {
  id: string; name: string; location: string; timeZone: TimeZone; status: FarmStatus;
  pondCount: number; pondsInOperation: number;
  technicalManagers: { id: string; name: string; status: 'active' | 'invited' }[];
  devicesOnline: number; devicesTotal: number;
  updatedAt: string; updatedBy: { id: string; name: string } | null;
}

interface PondRow {
  public_id: string;
  name: string;
  area_ha: string;
  status: PondStatus;
  latitude: string | null;
  longitude: string | null;
  sensor_count: string;
  actuator_count: string;
}

export interface AdminPond {
  id: string; name: string; areaHa: number; status: PondStatus;
  location: GeoPoint | null;
  sensorCount: number; actuatorCount: number;
}

function duplicate(error: unknown, code: string): never {
  if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23505') {
    throw new ApiProblem(409, code, 'Name already in use', {
      fieldErrors: [{ field: 'name', message: 'Already in use' }],
    });
  }
  throw error;
}

@Injectable()
export class AdminService {
  constructor(
    private readonly postgres: PostgresService,
    private readonly devices: AdminDevicesService,
  ) {}

  async listFarms(companyId: string): Promise<{ items: AdminFarm[] }> {
    const result = await this.postgres.pool.query<{ public_id: string }>(
      'SELECT public_id FROM farms WHERE company_id = $1 ORDER BY lower(name), public_id',
      [companyId],
    );
    return { items: await Promise.all(result.rows.map((row) => this.getFarm(companyId, row.public_id))) };
  }

  async getFarm(companyId: string, farmId: string): Promise<AdminFarm> {
    const result = await this.postgres.pool.query<FarmRow>(
      `SELECT f.id, f.public_id, f.name, f.location, f.time_zone, f.status, f.updated_at,
        u.public_id AS updated_by_id, u.name AS updated_by_name,
        (SELECT count(*) FROM ponds p WHERE p.farm_id = f.id) AS pond_count,
        (SELECT count(*) FROM ponds p WHERE p.farm_id = f.id AND p.status = 'in_operation')
          AS ponds_in_operation
       FROM farms f LEFT JOIN users u ON u.id = f.updated_by_user_id
       WHERE f.company_id = $1 AND f.public_id = $2`, [companyId, farmId],
    );
    const farm = result.rows[0];
    if (!farm) throw new ApiProblem(404, 'not_found', 'Farm not found');
    const managers = await this.postgres.pool.query<{
      public_id: string; name: string; status: 'active' | 'invited';
    }>(
      `SELECT u.public_id, u.name, u.status FROM user_farm_assignments a
       JOIN users u ON u.id = a.user_id
       WHERE a.farm_id = $1 AND a.unassigned_at IS NULL
         AND u.role = 'technical_manager' AND u.status IN ('active', 'invited')
       ORDER BY CASE u.status WHEN 'active' THEN 0 ELSE 1 END, lower(u.name)`,
      [farm.id],
    );
    const devices = await this.postgres.pool.query<{ device_id: string }>(
      `SELECT d.device_id FROM device_assignments a
       JOIN devices d ON d.id = a.device_id
       JOIN ponds p ON p.id = a.pond_id
       WHERE p.farm_id = $1 AND a.unassigned_at IS NULL AND d.enabled`, [farm.id],
    );
    const activeIds = new Set(devices.rows.map((row) => row.device_id));
    const onlineIds = activeIds.size
      ? await this.devices.onlineDeviceIds(companyId, farm.public_id) : new Set<string>();
    return {
      id: farm.public_id, name: farm.name, location: farm.location,
      timeZone: farm.time_zone, status: farm.status,
      pondCount: Number(farm.pond_count), pondsInOperation: Number(farm.ponds_in_operation),
      technicalManagers: managers.rows.map((manager) => ({
        id: manager.public_id, name: manager.name, status: manager.status,
      })),
      devicesTotal: activeIds.size,
      devicesOnline: [...activeIds].filter((id) => onlineIds.has(id)).length,
      updatedAt: farm.updated_at.toISOString(),
      updatedBy: farm.updated_by_id && farm.updated_by_name
        ? { id: farm.updated_by_id, name: farm.updated_by_name } : null,
    };
  }

  async createFarm(companyId: string, actorId: string, body: unknown): Promise<AdminFarm> {
    const data = inputObject(body);
    const name = requiredText(data.name, 'name');
    const location = requiredText(data.location, 'location');
    const timeZone = optionalEnum(data.timeZone, 'timeZone',
      ['Asia/Jakarta', 'Asia/Makassar', 'Asia/Jayapura'], 'Asia/Jakarta');
    if (data.status !== undefined && data.status !== 'inactive') {
      throw invalid('status', 'New farms start inactive');
    }
    const publicId = `farm-${randomUUID()}`;
    try {
      await this.postgres.pool.query(
        `INSERT INTO farms (public_id, company_id, name, location, time_zone, status,
           updated_by_user_id) VALUES ($1, $2, $3, $4, $5, 'inactive', $6)`,
        [publicId, companyId, name, location, timeZone, actorId],
      );
    } catch (error) { duplicate(error, 'farm_name_taken'); }
    return this.getFarm(companyId, publicId);
  }

  async updateFarm(companyId: string, actorId: string, farmId: string, body: unknown): Promise<AdminFarm> {
    const data = inputObject(body);
    const name = requiredText(data.name, 'name');
    const location = requiredText(data.location, 'location');
    const previous = await this.postgres.pool.query<{ time_zone: TimeZone; status: FarmStatus }>(
      'SELECT time_zone, status FROM farms WHERE company_id = $1 AND public_id = $2',
      [companyId, farmId],
    );
    if (!previous.rows[0]) throw new ApiProblem(404, 'not_found', 'Farm not found');
    const timeZone = optionalEnum(data.timeZone, 'timeZone',
      ['Asia/Jakarta', 'Asia/Makassar', 'Asia/Jayapura'], previous.rows[0].time_zone);
    const status = optionalEnum(data.status, 'status',
      ['active', 'inactive'], previous.rows[0].status);
    try {
      const updated = await this.postgres.pool.query(
        `UPDATE farms SET name = $3, location = $4, time_zone = $5, status = $6,
          updated_at = now(), updated_by_user_id = $7, row_version = row_version + 1
         WHERE company_id = $1 AND public_id = $2`,
        [companyId, farmId, name, location, timeZone, status, actorId],
      );
      if (!updated.rowCount) throw new ApiProblem(404, 'not_found', 'Farm not found');
    } catch (error) { duplicate(error, 'farm_name_taken'); }
    return this.getFarm(companyId, farmId);
  }

  async listPonds(companyId: string, farmId: string): Promise<{ items: AdminPond[] }> {
    const farm = await this.farmUuid(companyId, farmId);
    const result = await this.postgres.pool.query<PondRow>(
      `SELECT p.public_id, p.name, p.area_ha, p.status, p.latitude, p.longitude,
        (SELECT count(*) FROM device_assignments a JOIN devices d ON d.id = a.device_id
         WHERE a.pond_id = p.id AND a.unassigned_at IS NULL AND d.enabled
           AND d.type = 'sensor') AS sensor_count,
        (SELECT count(*) FROM device_assignments a JOIN devices d ON d.id = a.device_id
         WHERE a.pond_id = p.id AND a.unassigned_at IS NULL AND d.enabled
           AND d.type IN ('aerator', 'pump')) AS actuator_count
       FROM ponds p WHERE p.farm_id = $1 ORDER BY lower(p.name), p.public_id`, [farm],
    );
    return { items: result.rows.map((row) => this.pondResponse(row)) };
  }

  async createPond(companyId: string, farmId: string, body: unknown): Promise<AdminPond> {
    const farm = await this.farmUuid(companyId, farmId);
    const data = inputObject(body);
    const name = requiredText(data.name, 'name');
    const area = positiveNumber(data.areaHa, 'areaHa');
    const status = optionalEnum(data.status, 'status', ['in_operation', 'fallow'], 'in_operation');
    const location = optionalLocation(data.location, 'location') ?? null;
    const publicId = `pond-${randomUUID()}`;
    try {
      await this.postgres.pool.query(
        `INSERT INTO ponds (public_id, farm_id, name, area_ha, status, latitude, longitude)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [publicId, farm, name, area, status, location?.lat ?? null, location?.lng ?? null],
      );
    } catch (error) { duplicate(error, 'pond_name_taken'); }
    return this.getPond(companyId, publicId);
  }

  async updatePond(companyId: string, pondId: string, body: unknown): Promise<AdminPond> {
    const data = inputObject(body);
    const name = requiredText(data.name, 'name');
    const area = positiveNumber(data.areaHa, 'areaHa');
    const location = optionalLocation(data.location, 'location');
    const previous = await this.postgres.pool.query<{ status: PondStatus }>(
      `SELECT p.status FROM ponds p JOIN farms f ON f.id = p.farm_id
       WHERE f.company_id = $1 AND p.public_id = $2`, [companyId, pondId],
    );
    if (!previous.rows[0]) throw new ApiProblem(404, 'not_found', 'Pond not found');
    const status = optionalEnum(data.status, 'status',
      ['in_operation', 'fallow'], previous.rows[0].status);
    try {
      const updated = await this.postgres.pool.query(
        `UPDATE ponds p SET name = $3, area_ha = $4, status = $5,
          latitude = CASE WHEN $6::boolean THEN $7::numeric ELSE p.latitude END,
          longitude = CASE WHEN $6::boolean THEN $8::numeric ELSE p.longitude END,
          updated_at = now(), row_version = p.row_version + 1
         FROM farms f WHERE p.farm_id = f.id AND f.company_id = $1 AND p.public_id = $2`,
        [companyId, pondId, name, area, status, location !== undefined,
          location?.lat ?? null, location?.lng ?? null],
      );
      if (!updated.rowCount) throw new ApiProblem(404, 'not_found', 'Pond not found');
    } catch (error) { duplicate(error, 'pond_name_taken'); }
    return this.getPond(companyId, pondId);
  }

  private async getPond(companyId: string, pondId: string): Promise<AdminPond> {
    const result = await this.postgres.pool.query<PondRow>(
      `SELECT p.public_id, p.name, p.area_ha, p.status, p.latitude, p.longitude,
        (SELECT count(*) FROM device_assignments a JOIN devices d ON d.id = a.device_id
         WHERE a.pond_id = p.id AND a.unassigned_at IS NULL AND d.enabled
           AND d.type = 'sensor') AS sensor_count,
        (SELECT count(*) FROM device_assignments a JOIN devices d ON d.id = a.device_id
         WHERE a.pond_id = p.id AND a.unassigned_at IS NULL AND d.enabled
           AND d.type IN ('aerator', 'pump')) AS actuator_count
       FROM ponds p JOIN farms f ON f.id = p.farm_id
       WHERE f.company_id = $1 AND p.public_id = $2`, [companyId, pondId],
    );
    const pond = result.rows[0];
    if (!pond) throw new ApiProblem(404, 'not_found', 'Pond not found');
    return this.pondResponse(pond);
  }

  private pondResponse(pond: PondRow): AdminPond {
    return {
      id: pond.public_id, name: pond.name, areaHa: Number(pond.area_ha), status: pond.status,
      location: pond.latitude === null || pond.longitude === null
        ? null : { lat: Number(pond.latitude), lng: Number(pond.longitude) },
      sensorCount: Number(pond.sensor_count), actuatorCount: Number(pond.actuator_count),
    };
  }

  private async farmUuid(companyId: string, farmId: string): Promise<string> {
    const result = await this.postgres.pool.query<{ id: string }>(
      'SELECT id FROM farms WHERE company_id = $1 AND public_id = $2', [companyId, farmId],
    );
    if (!result.rows[0]) throw new ApiProblem(404, 'not_found', 'Farm not found');
    return result.rows[0].id;
  }

}
