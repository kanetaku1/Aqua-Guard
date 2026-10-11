import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { PoolClient } from 'pg';
import { AdminSettingsService } from '../admin/admin-settings.service';
import { AdminThresholdsService, Threshold } from '../admin/admin-thresholds.service';
import { Principal } from '../auth/auth.service';
import { ApiProblem } from '../http/problem';
import { PostgresService } from '../infrastructure/postgres.service';
import { BusinessScopeService } from './business-scope.service';
import { severityFor } from './sensor-current.service';

const LABS = ['tan', 'no2', 'vibrio', 'alkalinity'] as const;
type Lab = typeof LABS[number];
type Measurement = { sampleCount: number | null; sampleWeightG: number | null } &
  Record<Lab, number | null>;
type Input = Measurement & { date: string; note: string | null };
type Growth = Awaited<ReturnType<AdminSettingsService['getGrowth']>>;
interface Row {
  id: string; public_id: string; pond_id: string; farm_id: string; farm_uuid: string;
  sample_date: string; started_on: string; sample_count: number | null;
  sample_weight_g: string | null; tan: string | null; no2: string | null;
  vibrio: string | null; alkalinity: string | null; note: string | null;
  updated_at: Date; user_id: string; user_name: string;
  prior_date: string | null; prior_count: number | null; prior_weight: string | null;
}
const ROW_SQL = `SELECT r.id, r.public_id, p.public_id AS pond_id,
  f.public_id AS farm_id, f.id AS farm_uuid,
  to_char(r.sample_date, 'YYYY-MM-DD') AS sample_date,
  to_char(c.started_on, 'YYYY-MM-DD') AS started_on,
  r.sample_count, r.sample_weight_g, r.tan, r.no2, r.vibrio, r.alkalinity,
  r.note, r.updated_at, u.public_id AS user_id, u.name AS user_name,
  to_char(prior.sample_date, 'YYYY-MM-DD') AS prior_date,
  prior.sample_count AS prior_count, prior.sample_weight_g AS prior_weight
  FROM sampling_records r
  JOIN ponds p ON p.id = r.pond_id JOIN farms f ON f.id = p.farm_id
  JOIN production_cycles c ON c.id = r.cycle_id
  JOIN users u ON u.id = r.recorded_by
  LEFT JOIN LATERAL (
    SELECT sample_date, sample_count, sample_weight_g FROM sampling_records
    WHERE cycle_id = r.cycle_id AND sample_date < r.sample_date
      AND sample_count IS NOT NULL AND sample_weight_g IS NOT NULL
    ORDER BY sample_date DESC LIMIT 1
  ) prior ON true`;

function invalid(field: string, message: string): never {
  throw new ApiProblem(422, 'validation_error', 'Invalid sampling input', {
    fieldErrors: [{ field, message }],
  });
}
function date(value: unknown, field: string): string {
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\d$/.test(value)) {
    return invalid(field, 'Must be a valid date');
  }
  const parsed = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    return invalid(field, 'Must be a valid date');
  }
  return value;
}
function days(a: string, b: string): number {
  return Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86400000);
}
function measurement(raw: Record<string, unknown>): Measurement {
  const value = (field: string, positive: boolean): number | null => {
    const item = raw[field];
    if (item === undefined || item === null) return null;
    if (typeof item !== 'number' || !Number.isFinite(item) || item < 0
      || (positive && (!Number.isSafeInteger(item) || item < 1))) {
      return invalid(field, positive ? 'Must be a positive integer' : 'Must be a nonnegative number');
    }
    return item;
  };
  const sampleCount = value('sampleCount', true);
  const sampleWeightG = value('sampleWeightG', false);
  if ((sampleCount === null) !== (sampleWeightG === null)) {
    return invalid('sampleWeightG', 'Sample count and weight must be provided together');
  }
  return { sampleCount, sampleWeightG,
    tan: value('tan', false), no2: value('no2', false),
    vibrio: value('vibrio', false), alkalinity: value('alkalinity', false) };
}
function input(body: unknown, today: string): Input {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return invalid('body', 'Must be an object');
  const raw = body as Record<string, unknown>;
  const sampleDate = date(raw.date, 'date');
  if (sampleDate > today) return invalid('date', 'Future dates are not allowed');
  if (raw.note !== undefined && raw.note !== null && typeof raw.note !== 'string') {
    return invalid('note', 'Must be text or null');
  }
  return { date: sampleDate, note: raw.note as string | null ?? null, ...measurement(raw) };
}
function target(doc: number, growth: Growth): number | null {
  const points = growth.points;
  if (!points.length || doc < points[0].doc || doc > points[points.length - 1].doc) return null;
  const highIndex = points.findIndex((point) => point.doc >= doc);
  const high = points[highIndex];
  if (high.doc === doc) return high.targetAbwG;
  const low = points[highIndex - 1];
  return low.targetAbwG + (high.targetAbwG - low.targetAbwG)
    * (doc - low.doc) / (high.doc - low.doc);
}
function conflict(error: unknown): never {
  if (error && typeof error === 'object' && 'code' in error && error.code === '23505') {
    throw new ApiProblem(409, 'sampling_date_exists', 'Sampling already exists for this pond and date');
  }
  throw error;
}

@Injectable()
export class SamplingService {
  constructor(
    private readonly postgres: PostgresService,
    private readonly scope: BusinessScopeService,
    private readonly settings: AdminSettingsService,
    private readonly thresholds: AdminThresholdsService,
  ) {}

  private tm(principal: Principal): void {
    if (principal.role !== 'technical_manager') {
      throw new ApiProblem(403, 'forbidden', 'Technical manager access required');
    }
  }

  private async farm(principal: Principal, farmId: string) {
    this.tm(principal);
    const visible = await this.scope.visibleFarmIds(principal);
    const result = await this.postgres.pool.query<{ id: string; time_zone: string }>(
      'SELECT id, time_zone FROM farms WHERE public_id = $1 AND company_id = $2 AND public_id = ANY($3)',
      [farmId, principal.companyId, visible],
    );
    if (!result.rows[0]) throw new ApiProblem(404, 'not_found', 'Farm not found');
    const farm = result.rows[0];
    const today = new Intl.DateTimeFormat('sv-SE', { timeZone: farm.time_zone }).format(new Date());
    return { id: farm.id, today };
  }

  private async pond(principal: Principal, pondId: string) {
    this.tm(principal);
    const pond = await this.scope.requirePond(principal, pondId);
    return { ...pond, ...(await this.farm(principal, pond.farmId)) };
  }

  private growth(principal: Principal): Promise<Growth> {
    return this.settings.getGrowth({ companyId: principal.companyId, actorId: principal.userId });
  }

  private async format(rows: Row[], principal: Principal, growth: Growth) {
    const farms = [...new Set(rows.map((row) => row.farm_uuid))];
    const thresholds = new Map<string, Threshold>();
    await Promise.all(farms.flatMap((farm) => LABS.map(async (lab) => {
      thresholds.set(`${farm}:${lab}`,
        await this.thresholds.effectiveThreshold(principal.companyId, farm, lab));
    })));
    return rows.map((row) => {
      const doc = days(row.sample_date, row.started_on);
      const abwG = row.sample_count === null ? null : Number(row.sample_weight_g) / row.sample_count;
      const priorAbw = row.prior_count === null ? null : Number(row.prior_weight) / row.prior_count;
      const adgGPerDay = abwG === null || priorAbw === null || row.prior_date === null
        ? null : (abwG - priorAbw) / days(row.sample_date, row.prior_date);
      const targetAbwG = target(doc, growth);
      const vsTargetPct = abwG === null || targetAbwG === null
        ? null : (abwG / targetAbwG - 1) * 100;
      const growthState = vsTargetPct === null ? null
        : vsTargetPct <= -growth.onTrackBandPct ? 'behind'
          : vsTargetPct >= growth.onTrackBandPct ? 'ahead' : 'on_track';
      const labs = Object.fromEntries(LABS.map((lab) => [lab,
        row[lab] === null ? null : Number(row[lab])])) as Record<Lab, number | null>;
      const labSeverity = Object.fromEntries(LABS.map((lab) => [lab,
        labs[lab] === null ? null : severityFor(labs[lab], thresholds.get(`${row.farm_uuid}:${lab}`)!) ]));
      return { id: row.public_id, pondId: row.pond_id, date: row.sample_date,
        sampleCount: row.sample_count, sampleWeightG: row.sample_weight_g === null
          ? null : Number(row.sample_weight_g), ...labs, note: row.note,
        recordedBy: { id: row.user_id, name: row.user_name },
        updatedAt: row.updated_at.toISOString(), doc, abwG, adgGPerDay,
        targetAbwG, vsTargetPct, growth: growthState,
        labPending: LABS.some((lab) => labs[lab] === null), labSeverity };
    });
  }

  private async rows(where: string, values: unknown[]): Promise<Row[]> {
    const result = await this.postgres.pool.query<Row>(`${ROW_SQL} WHERE ${where}
      ORDER BY r.sample_date DESC, p.public_id`, values);
    return result.rows;
  }

  private async one(id: string, principal: Principal, growth: Growth) {
    const rows = await this.rows('r.id = $1', [id]);
    return (await this.format(rows, principal, growth))[0];
  }

  async pondList(principal: Principal, pondId: string) {
    const pond = await this.pond(principal, pondId);
    const growth = await this.growth(principal);
    return { items: await this.format(await this.rows('r.pond_id = $1', [pond.pondUuid]),
      principal, growth), growthCurve: growth.points };
  }

  async farmList(principal: Principal, farmId: string, rawDate: unknown) {
    const farm = await this.farm(principal, farmId);
    const sampleDate = date(rawDate, 'date');
    const growth = await this.growth(principal);
    return { items: await this.format(await this.rows(
      'f.id = $1 AND r.sample_date = $2', [farm.id, sampleDate]), principal, growth),
      growthCurve: growth.points, onTrackBandPct: growth.onTrackBandPct };
  }

  private async cycle(client: PoolClient, pondUuid: string, sampleDate: string): Promise<string> {
    const found = await client.query<{ id: string }>(
      `SELECT id FROM production_cycles WHERE pond_id = $1 AND started_on <= $2::date
       AND (ended_on IS NULL OR ended_on >= $2::date) ORDER BY started_on DESC LIMIT 1`,
      [pondUuid, sampleDate],
    );
    if (!found.rows[0]) return invalid('date', 'No production cycle covers the sampling date');
    return found.rows[0].id;
  }

  private async insert(client: PoolClient, principal: Principal, pondUuid: string,
    data: Input, cycleId: string): Promise<string> {
    const result = await client.query<{ id: string }>(
      `INSERT INTO sampling_records (public_id, pond_id, cycle_id, sample_date,
        sample_count, sample_weight_g, tan, no2, vibrio, alkalinity, note, recorded_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
      [`SMP-${randomUUID()}`, pondUuid, cycleId, data.date, data.sampleCount,
        data.sampleWeightG, data.tan, data.no2, data.vibrio, data.alkalinity,
        data.note, principal.userId],
    );
    return result.rows[0].id;
  }

  private async change(client: PoolClient, principal: Principal, id: string,
    cycleId: string, data: Input, preserveNote = false): Promise<void> {
    const previous = await client.query(
      `SELECT sample_date, sample_count, sample_weight_g, tan, no2, vibrio,
         alkalinity, note FROM sampling_records WHERE id = $1 FOR UPDATE`, [id],
    );
    await client.query(
      `UPDATE sampling_records SET cycle_id=$2, sample_date=$3,
        sample_count=$4, sample_weight_g=$5, tan=$6, no2=$7, vibrio=$8,
        alkalinity=$9, note=CASE WHEN $10::boolean THEN note ELSE $11 END,
        updated_at=now(), row_version=row_version+1 WHERE id=$1`,
      [id, cycleId, data.date, data.sampleCount, data.sampleWeightG,
        data.tan, data.no2, data.vibrio, data.alkalinity, preserveNote, data.note],
    );
    await client.query(
      `INSERT INTO sampling_record_audit (record_id, changed_by, previous, current_value)
       VALUES ($1,$2,$3,$4)`,
      [id, principal.userId, JSON.stringify(previous.rows[0]), JSON.stringify(data)],
    );
  }

  async create(principal: Principal, pondId: string, body: unknown) {
    const pond = await this.pond(principal, pondId);
    const data = input(body, pond.today);
    const client = await this.postgres.pool.connect();
    let id: string;
    try {
      await client.query('BEGIN');
      const cycleId = await this.cycle(client, pond.pondUuid, data.date);
      id = await this.insert(client, principal, pond.pondUuid, data, cycleId);
      await client.query('COMMIT');
    } catch (error) { await client.query('ROLLBACK'); return conflict(error); }
    finally { client.release(); }
    return this.one(id, principal, await this.growth(principal));
  }

  async update(principal: Principal, recordId: string, body: unknown) {
    this.tm(principal);
    const targetRow = await this.postgres.pool.query<{ id: string; pond_id: string }>(
      `SELECT r.id, p.public_id AS pond_id FROM sampling_records r
       JOIN ponds p ON p.id = r.pond_id WHERE r.public_id = $1`, [recordId],
    );
    if (!targetRow.rows[0]) throw new ApiProblem(404, 'not_found', 'Sampling record not found');
    const pond = await this.pond(principal, targetRow.rows[0].pond_id);
    const data = input(body, pond.today);
    const client = await this.postgres.pool.connect();
    try {
      await client.query('BEGIN');
      const cycleId = await this.cycle(client, pond.pondUuid, data.date);
      await this.change(client, principal, targetRow.rows[0].id, cycleId, data);
      await client.query('COMMIT');
    } catch (error) { await client.query('ROLLBACK'); return conflict(error); }
    finally { client.release(); }
    return this.one(targetRow.rows[0].id, principal, await this.growth(principal));
  }

  async batch(principal: Principal, farmId: string, body: unknown) {
    const farm = await this.farm(principal, farmId);
    if (!body || typeof body !== 'object' || Array.isArray(body)) return invalid('body', 'Must be an object');
    const raw = body as Record<string, unknown>;
    const sampleDate = date(raw.date, 'date');
    if (sampleDate > farm.today) return invalid('date', 'Future dates are not allowed');
    if (!Array.isArray(raw.entries)) return invalid('entries', 'Must be an array');
    const entries = raw.entries.map((item, index) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        return invalid(`entries/${index}`, 'Must be an object');
      }
      const entry = item as Record<string, unknown>;
      if (typeof entry.pondId !== 'string' || !entry.pondId) {
        return invalid(`entries/${index}/pondId`, 'Required pond ID');
      }
      return { pondId: entry.pondId, data: { date: sampleDate, note: null,
        ...measurement(entry) } as Input };
    });
    if (new Set(entries.map((entry) => entry.pondId)).size !== entries.length) {
      return invalid('entries', 'Duplicate pond ID');
    }
    const ponds = await this.postgres.pool.query<{ id: string; public_id: string }>(
      'SELECT id, public_id FROM ponds WHERE farm_id = $1 AND public_id = ANY($2)',
      [farm.id, entries.map((entry) => entry.pondId)],
    );
    const pondMap = new Map(ponds.rows.map((row) => [row.public_id, row.id]));
    if (entries.some((entry) => !pondMap.has(entry.pondId))) {
      throw new ApiProblem(404, 'not_found', 'Pond not found in farm');
    }
    const client = await this.postgres.pool.connect();
    const ids = new Map<string, string>();
    try {
      await client.query('BEGIN');
      await client.query('SELECT id FROM farms WHERE id=$1 FOR UPDATE', [farm.id]);
      for (const entry of [...entries].sort((a, b) => a.pondId.localeCompare(b.pondId))) {
        const pondUuid = pondMap.get(entry.pondId)!;
        const cycleId = await this.cycle(client, pondUuid, sampleDate);
        const existing = await client.query<{ id: string }>(
          'SELECT id FROM sampling_records WHERE pond_id=$1 AND sample_date=$2 FOR UPDATE',
          [pondUuid, sampleDate],
        );
        const id = existing.rows[0]?.id;
        if (id) await this.change(client, principal, id, cycleId, entry.data, true);
        ids.set(entry.pondId, id ?? await this.insert(client, principal, pondUuid, entry.data, cycleId));
      }
      await client.query('COMMIT');
    } catch (error) { await client.query('ROLLBACK'); return conflict(error); }
    finally { client.release(); }
    const growth = await this.growth(principal);
    return { items: await Promise.all(entries.map((entry) =>
      this.one(ids.get(entry.pondId)!, principal, growth))) };
  }
}
