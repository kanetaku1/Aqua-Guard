import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { Principal } from '../auth/auth.service';
import { ApiProblem } from '../http/problem';
import { PostgresService } from '../infrastructure/postgres.service';
import { BusinessScopeService } from './business-scope.service';

const TRAY_CHECKS = [
  'empty_within_2h', 'leftover_under_5', 'leftover_10', 'leftover_over_20',
] as const;
type TrayCheck = typeof TRAY_CHECKS[number];
interface FeedingInput {
  date: string; round: number; feedType: string; amountKg: number;
  trayCheck: TrayCheck | null; note: string | null;
}
interface FeedingRow {
  public_id: string; pond_id: string; record_day: string; round_no: number;
  feed_type: string; amount_kg: string; tray_check: TrayCheck | null;
  note: string | null; record_time: string; updated_at: Date;
  user_id: string; user_name: string;
}

function invalid(field: string, message: string): never {
  throw new ApiProblem(422, 'validation_error', 'Invalid feeding input', {
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

function pageInt(value: unknown, field: string, fallback: number, max: number): number {
  if (value === undefined) return fallback;
  const parsed = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : NaN;
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > max) {
    return invalid(field, `Must be an integer from 1 to ${max}`);
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

function parseInput(body: unknown, today: string): FeedingInput {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return invalid('body', 'Must be an object');
  }
  const raw = body as Record<string, unknown>;
  const recordDate = date(raw.date, 'date');
  if (recordDate > today) return invalid('date', 'Future dates are not allowed');
  if (!Number.isInteger(raw.round) || (raw.round as number) < 1
    || (raw.round as number) > 2147483647) return invalid('round', 'Must be a positive integer');
  if (typeof raw.feedType !== 'string' || !raw.feedType.trim()) {
    return invalid('feedType', 'Required text');
  }
  if (typeof raw.amountKg !== 'number' || !Number.isFinite(raw.amountKg)
    || raw.amountKg <= 0) return invalid('amountKg', 'Must be greater than zero');
  const trayCheck = raw.trayCheck === undefined || raw.trayCheck === null
    ? null : raw.trayCheck;
  if (trayCheck !== null && (typeof trayCheck !== 'string'
    || !TRAY_CHECKS.includes(trayCheck as TrayCheck))) {
    return invalid('trayCheck', 'Unsupported tray check');
  }
  const note = raw.note === undefined || raw.note === null ? null : raw.note;
  if (note !== null && typeof note !== 'string') return invalid('note', 'Must be text or null');
  return { date: recordDate, round: raw.round as number,
    feedType: raw.feedType.trim(), amountKg: raw.amountKg,
    trayCheck: trayCheck as TrayCheck | null, note: note as string | null };
}

function response(row: FeedingRow) {
  return { id: row.public_id, pondId: row.pond_id, date: row.record_day,
    round: row.round_no, feedType: row.feed_type, amountKg: Number(row.amount_kg),
    trayCheck: row.tray_check, note: row.note, time: row.record_time,
    recordedBy: { id: row.user_id, name: row.user_name },
    updatedAt: row.updated_at.toISOString() };
}

function translateUnique(error: unknown): never {
  if (error && typeof error === 'object' && 'code' in error && error.code === '23505') {
    throw new ApiProblem(409, 'feeding_round_exists', 'Feeding round already has a record');
  }
  throw error;
}

@Injectable()
export class FeedingService {
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
    const page = pageInt(query.page, 'page', 1, 1000000);
    const pageSize = pageInt(query.pageSize, 'pageSize', 20, 100);
    const [rows, count, totals] = await Promise.all([
      this.postgres.pool.query<FeedingRow>(
        `SELECT r.public_id, p.public_id AS pond_id,
           to_char(r.record_date, 'YYYY-MM-DD') AS record_day,
           r.round_no, r.feed_type, r.amount_kg, r.tray_check, r.note,
           to_char(r.created_at AT TIME ZONE 'Asia/Jakarta', 'HH24:MI') AS record_time,
           r.updated_at, u.public_id AS user_id, u.name AS user_name
         FROM feeding_records r JOIN ponds p ON p.id = r.pond_id
         JOIN users u ON u.id = r.recorded_by
         WHERE r.pond_id = $1 AND ($2::date IS NULL OR r.record_date >= $2::date)
           AND ($3::date IS NULL OR r.record_date <= $3::date)
         ORDER BY r.record_date DESC, r.round_no DESC, r.created_at DESC
         LIMIT $4 OFFSET $5`,
        [pond.pondUuid, from, to, pageSize, (page - 1) * pageSize],
      ),
      this.postgres.pool.query<{ total: string }>(
        `SELECT count(*) AS total FROM feeding_records
         WHERE pond_id = $1 AND ($2::date IS NULL OR record_date >= $2::date)
           AND ($3::date IS NULL OR record_date <= $3::date)`,
        [pond.pondUuid, from, to],
      ),
      this.postgres.pool.query<{ record_day: string; total_kg: string }>(
        `SELECT to_char(days.day, 'YYYY-MM-DD') AS record_day,
           COALESCE(sum(r.amount_kg), 0)::text AS total_kg
         FROM generate_series($2::date - 1, $2::date, interval '1 day') AS days(day)
         LEFT JOIN feeding_records r ON r.pond_id = $1 AND r.record_date = days.day::date
         GROUP BY days.day ORDER BY days.day`,
        [pond.pondUuid, pond.today],
      ),
    ]);
    return { page, pageSize, total: Number(count.rows[0].total),
      items: rows.rows.map(response),
      dailyTotals: totals.rows.map((row) => ({ date: row.record_day,
        totalKg: Number(row.total_kg) })) };
  }

  async create(principal: Principal, pondId: string, body: unknown) {
    const pond = await this.pond(principal, pondId);
    const input = parseInput(body, pond.today);
    let id: string;
    try {
      const inserted = await this.postgres.pool.query<{ id: string }>(
        `INSERT INTO feeding_records
           (public_id, pond_id, cycle_id, record_date, round_no, feed_type,
            amount_kg, tray_check, note, recorded_by)
         VALUES ($1, $2, (SELECT id FROM production_cycles WHERE pond_id = $2
           AND started_on <= $3::date AND (ended_on IS NULL OR ended_on >= $3::date)
           ORDER BY started_on DESC LIMIT 1), $3, $4, $5, $6, $7, $8, $9)
         RETURNING id`,
        [`FED-${randomUUID()}`, pond.pondUuid, input.date, input.round,
          input.feedType, input.amountKg, input.trayCheck, input.note, principal.userId],
      );
      id = inserted.rows[0].id;
    } catch (error) { return translateUnique(error); }
    return this.getRow(id);
  }

  async update(principal: Principal, recordId: string, body: unknown) {
    this.requireTm(principal);
    const target = await this.postgres.pool.query<{ id: string; pond_id: string }>(
      `SELECT r.id, p.public_id AS pond_id FROM feeding_records r
       JOIN ponds p ON p.id = r.pond_id WHERE r.public_id = $1`, [recordId],
    );
    if (!target.rows[0]) throw new ApiProblem(404, 'not_found', 'Feeding record not found');
    const pond = await this.pond(principal, target.rows[0].pond_id);
    const input = parseInput(body, pond.today);
    const client = await this.postgres.pool.connect();
    try {
      await client.query('BEGIN');
      const previous = await client.query<{
        record_date: string | Date; round_no: number; feed_type: string;
        amount_kg: string; tray_check: TrayCheck | null; note: string | null;
      }>(
        `SELECT record_date, round_no, feed_type, amount_kg, tray_check, note
         FROM feeding_records WHERE id = $1 FOR UPDATE`, [target.rows[0].id],
      );
      await client.query(
        `UPDATE feeding_records SET
           cycle_id = (SELECT id FROM production_cycles WHERE pond_id = $2
             AND started_on <= $3::date AND (ended_on IS NULL OR ended_on >= $3::date)
             ORDER BY started_on DESC LIMIT 1),
           record_date = $3, round_no = $4, feed_type = $5,
           amount_kg = $6, tray_check = $7, note = $8,
           updated_at = now(), row_version = row_version + 1
         WHERE id = $1`,
        [target.rows[0].id, pond.pondUuid, input.date, input.round,
          input.feedType, input.amountKg, input.trayCheck, input.note],
      );
      await client.query(
        `INSERT INTO feeding_record_audit
           (record_id, changed_by, previous, current_value)
         VALUES ($1, $2, $3, $4)`,
        [target.rows[0].id, principal.userId,
          JSON.stringify(previous.rows[0]), JSON.stringify(input)],
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      return translateUnique(error);
    } finally { client.release(); }
    return this.getRow(target.rows[0].id);
  }

  private async getRow(id: string) {
    const result = await this.postgres.pool.query<FeedingRow>(
      `SELECT r.public_id, p.public_id AS pond_id,
         to_char(r.record_date, 'YYYY-MM-DD') AS record_day,
         r.round_no, r.feed_type, r.amount_kg, r.tray_check, r.note,
         to_char(r.created_at AT TIME ZONE 'Asia/Jakarta', 'HH24:MI') AS record_time,
         r.updated_at, u.public_id AS user_id, u.name AS user_name
       FROM feeding_records r JOIN ponds p ON p.id = r.pond_id
       JOIN users u ON u.id = r.recorded_by WHERE r.id = $1`, [id],
    );
    return response(result.rows[0]);
  }
}
