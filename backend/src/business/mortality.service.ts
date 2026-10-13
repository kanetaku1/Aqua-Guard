import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { Principal } from '../auth/auth.service';
import { ApiProblem } from '../http/problem';
import { PostgresService } from '../infrastructure/postgres.service';
import { BusinessScopeService } from './business-scope.service';

const OBSERVATIONS = ['routine_check', 'low_do', 'disease_signs', 'molting', 'other'] as const;
type Observation = typeof OBSERVATIONS[number];
interface MortalityInput {
  date: string; count: number; weightKg: number;
  observation: Observation | null; note: string | null;
}
interface MortalityRow {
  public_id: string; pond_id: string; record_day: string;
  count: number; weight_kg: string; observation: Observation | null; note: string | null;
  updated_at: Date; user_id: string; user_name: string;
}

function invalid(field: string, message: string): never {
  throw new ApiProblem(422, 'validation_error', 'Invalid mortality input', {
    fieldErrors: [{ field, message }],
  });
}

function date(value: unknown, field: string): string {
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\d$/.test(value)) {
    return invalid(field, 'Must be a valid date');
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    return invalid(field, 'Must be a valid date');
  }
  return value;
}

function positiveInt(value: unknown, field: string, fallback: number, maximum: number): number {
  if (value === undefined) return fallback;
  const parsed = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : NaN;
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > maximum) {
    return invalid(field, `Must be an integer from 1 to ${maximum}`);
  }
  return parsed;
}

function farmToday(timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

function parseInput(body: unknown, today: string): MortalityInput {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return invalid('body', 'Must be an object');
  }
  const raw = body as Record<string, unknown>;
  const recordDate = date(raw.date, 'date');
  if (recordDate > today) return invalid('date', 'Future dates are not allowed');
  if (!Number.isInteger(raw.count) || (raw.count as number) < 0
    || (raw.count as number) > 2147483647) return invalid('count', 'Must be a nonnegative integer');
  if (typeof raw.weightKg !== 'number' || !Number.isFinite(raw.weightKg)
    || raw.weightKg < 0) return invalid('weightKg', 'Must be a nonnegative number');
  const observation = raw.observation === undefined || raw.observation === null
    ? null : raw.observation;
  if (observation !== null && (typeof observation !== 'string'
    || !OBSERVATIONS.includes(observation as Observation))) {
    return invalid('observation', 'Unsupported observation');
  }
  const note = raw.note === undefined || raw.note === null ? null : raw.note;
  if (note !== null && typeof note !== 'string') return invalid('note', 'Must be text or null');
  return { date: recordDate, count: raw.count as number, weightKg: raw.weightKg,
    observation: observation as Observation | null, note: note as string | null };
}

function response(row: MortalityRow) {
  return { id: row.public_id, pondId: row.pond_id,
    date: row.record_day,
    count: row.count, weightKg: Number(row.weight_kg), observation: row.observation,
    note: row.note, recordedBy: { id: row.user_id, name: row.user_name },
    updatedAt: row.updated_at.toISOString() };
}

@Injectable()
export class MortalityService {
  constructor(
    private readonly postgres: PostgresService,
    private readonly scope: BusinessScopeService,
  ) {}

  private requireTm(principal: Principal): void {
    if (principal.role !== 'technical_manager') {
      throw new ApiProblem(403, 'forbidden', 'Technical manager access required');
    }
  }

  private async pond(principal: Principal, pondId: string) {
    this.requireTm(principal);
    const pond = await this.scope.requirePond(principal, pondId);
    const result = await this.postgres.pool.query<{ time_zone: string }>(
      'SELECT time_zone FROM farms WHERE id = $1', [pond.farmUuid],
    );
    return { ...pond, today: farmToday(result.rows[0].time_zone) };
  }

  async list(principal: Principal, pondId: string, query: Record<string, unknown>) {
    const pond = await this.pond(principal, pondId);
    const from = query.from === undefined ? null : date(query.from, 'from');
    const to = query.to === undefined ? null : date(query.to, 'to');
    if (from && to && from > to) return invalid('to', 'Must be on or after from');
    const page = positiveInt(query.page, 'page', 1, 1000000);
    const pageSize = positiveInt(query.pageSize, 'pageSize', 20, 100);
    const [rows, totals] = await Promise.all([
      this.postgres.pool.query<MortalityRow & { total: string }>(
        `SELECT r.public_id, p.public_id AS pond_id,
           to_char(r.record_date, 'YYYY-MM-DD') AS record_day,
           r.count, r.weight_kg, r.observation, r.note, r.updated_at,
           u.public_id AS user_id, u.name AS user_name, count(*) OVER() AS total
         FROM mortality_records r JOIN ponds p ON p.id = r.pond_id
         JOIN users u ON u.id = r.recorded_by
         WHERE r.pond_id = $1 AND ($2::date IS NULL OR r.record_date >= $2::date)
           AND ($3::date IS NULL OR r.record_date <= $3::date)
         ORDER BY r.record_date DESC, r.created_at DESC, r.public_id DESC
         LIMIT $4 OFFSET $5`,
        [pond.pondUuid, from, to, pageSize, (page - 1) * pageSize],
      ),
      this.postgres.pool.query<{ count: string; weight_kg: string }>(
        `SELECT COALESCE(sum(count), 0)::text AS count,
           COALESCE(sum(weight_kg), 0)::text AS weight_kg
         FROM mortality_records WHERE pond_id = $1
           AND record_date BETWEEN $2::date - 6 AND $2::date`,
        [pond.pondUuid, pond.today],
      ),
    ]);
    const total = rows.rows.length ? Number(rows.rows[0].total) : Number((await this.postgres.pool.query<{
      total: string;
    }>(
      `SELECT count(*) AS total FROM mortality_records
       WHERE pond_id = $1 AND ($2::date IS NULL OR record_date >= $2::date)
         AND ($3::date IS NULL OR record_date <= $3::date)`,
      [pond.pondUuid, from, to],
    )).rows[0].total);
    return { page, pageSize, total, items: rows.rows.map(response),
      last7Days: { count: Number(totals.rows[0].count),
        weightKg: Number(totals.rows[0].weight_kg) } };
  }

  async create(principal: Principal, pondId: string, body: unknown) {
    const pond = await this.pond(principal, pondId);
    const input = parseInput(body, pond.today);
    const inserted = await this.postgres.pool.query<{ id: string }>(
      `INSERT INTO mortality_records
         (public_id, pond_id, cycle_id, record_date, count, weight_kg,
          observation, note, recorded_by)
       VALUES ($1, $2, (SELECT id FROM production_cycles WHERE pond_id = $2
         AND started_on <= $3::date AND (ended_on IS NULL OR ended_on >= $3::date)
         ORDER BY started_on DESC LIMIT 1), $3, $4, $5, $6, $7, $8)
       RETURNING id`,
      [`MOR-${randomUUID()}`, pond.pondUuid, input.date, input.count,
        input.weightKg, input.observation, input.note, principal.userId],
    );
    return this.getRow(inserted.rows[0].id);
  }

  async update(principal: Principal, recordId: string, body: unknown) {
    this.requireTm(principal);
    const target = await this.postgres.pool.query<{ id: string; pond_id: string }>(
      `SELECT r.id, p.public_id AS pond_id FROM mortality_records r
       JOIN ponds p ON p.id = r.pond_id WHERE r.public_id = $1`, [recordId],
    );
    if (!target.rows[0]) throw new ApiProblem(404, 'not_found', 'Mortality record not found');
    const pond = await this.pond(principal, target.rows[0].pond_id);
    const input = parseInput(body, pond.today);
    const client = await this.postgres.pool.connect();
    try {
      await client.query('BEGIN');
      const previous = await client.query<{
        record_date: string | Date; count: number; weight_kg: string;
        observation: Observation | null; note: string | null;
      }>(
        'SELECT record_date, count, weight_kg, observation, note FROM mortality_records WHERE id = $1 FOR UPDATE',
        [target.rows[0].id],
      );
      await client.query(
        `UPDATE mortality_records SET
           cycle_id = (SELECT id FROM production_cycles WHERE pond_id = $2
             AND started_on <= $3::date AND (ended_on IS NULL OR ended_on >= $3::date)
             ORDER BY started_on DESC LIMIT 1),
           record_date = $3, count = $4, weight_kg = $5,
           observation = $6, note = $7, updated_at = now(), row_version = row_version + 1
         WHERE id = $1`,
        [target.rows[0].id, pond.pondUuid, input.date, input.count,
          input.weightKg, input.observation, input.note],
      );
      await client.query(
        `INSERT INTO mortality_record_audit
           (record_id, changed_by, previous, current_value)
         VALUES ($1, $2, $3, $4)`,
        [target.rows[0].id, principal.userId,
          JSON.stringify(previous.rows[0]), JSON.stringify(input)],
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
    return this.getRow(target.rows[0].id);
  }

  private async getRow(id: string) {
    const result = await this.postgres.pool.query<MortalityRow>(
      `SELECT r.public_id, p.public_id AS pond_id,
         to_char(r.record_date, 'YYYY-MM-DD') AS record_day,
         r.count, r.weight_kg, r.observation, r.note, r.updated_at,
         u.public_id AS user_id, u.name AS user_name
       FROM mortality_records r JOIN ponds p ON p.id = r.pond_id
       JOIN users u ON u.id = r.recorded_by WHERE r.id = $1`, [id],
    );
    return response(result.rows[0]);
  }
}
