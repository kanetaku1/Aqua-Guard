import { Injectable } from '@nestjs/common';
import { PoolClient } from 'pg';
import { ApiProblem } from '../http/problem';
import { PostgresService } from '../infrastructure/postgres.service';
import { inputObject } from './admin-input';
import { UserScope } from './admin-users.service';

interface MetaRow { updated_at: Date; updated_by_id: string; updated_by_name: string }
interface GrowthRow extends MetaRow { id: string; on_track_band_pct: string }
interface RuleRow extends MetaRow {
  daily_report_due: string; weekly_report_due_weekday: number; weekly_report_due_time: string;
  sensor_delayed_after_minutes: number; sensor_offline_after_minutes: number;
  attention_to_alert_minutes: number; production_attention_pct: string;
  production_warning_pct: string;
}
interface GrowthPoint { doc: number; targetAbwG: number }
interface RuleInput {
  dailyReportDue: string; weeklyReportDueWeekday: number; weeklyReportDueTime: string;
  sensorDelayedAfterMinutes: number; sensorOfflineAfterMinutes: number;
  attentionToAlertMinutes: number; productionAttentionPct: number; productionWarningPct: number;
}
type SettingsMeta = { updatedAt: string; updatedBy: { id: string; name: string } };

const INITIAL_GROWTH: GrowthPoint[] = [
  { doc: 27, targetAbwG: 5.3 }, { doc: 34, targetAbwG: 7.4 },
  { doc: 41, targetAbwG: 9.5 }, { doc: 48, targetAbwG: 11.5 },
  { doc: 55, targetAbwG: 13.3 }, { doc: 62, targetAbwG: 15 },
  { doc: 69, targetAbwG: 16.6 }, { doc: 76, targetAbwG: 18.2 },
];
const INITIAL_RULES: RuleInput = {
  dailyReportDue: '18:00', weeklyReportDueWeekday: 1, weeklyReportDueTime: '12:00',
  sensorDelayedAfterMinutes: 15, sensorOfflineAfterMinutes: 60,
  attentionToAlertMinutes: 30, productionAttentionPct: 25, productionWarningPct: 50,
};

function meta(row: MetaRow): SettingsMeta {
  return { updatedAt: row.updated_at.toISOString(),
    updatedBy: { id: row.updated_by_id, name: row.updated_by_name } };
}

function validation(errors: { field: string; message: string }[]): never {
  throw new ApiProblem(422, 'validation_error', 'Invalid settings', { fieldErrors: errors });
}

function parseGrowth(body: unknown): { points: GrowthPoint[]; onTrackBandPct: number } {
  const data = inputObject(body);
  const errors: { field: string; message: string }[] = [];
  if (!Array.isArray(data.points) || data.points.length < 2) {
    errors.push({ field: 'points', message: 'Enter at least two points' });
  }
  const points: GrowthPoint[] = [];
  if (Array.isArray(data.points)) data.points.forEach((value, index) => {
    const point = typeof value === 'object' && value !== null && !Array.isArray(value)
      ? value as Record<string, unknown> : {};
    const previous = points[index - 1];
    if (!Number.isInteger(point.doc) || (point.doc as number) < 0
      || (previous && (point.doc as number) <= previous.doc)) {
      errors.push({ field: `points/${index}/doc`, message: 'DOC must increase' });
    }
    if (typeof point.targetAbwG !== 'number' || !Number.isFinite(point.targetAbwG)
      || point.targetAbwG <= 0 || (previous && point.targetAbwG <= previous.targetAbwG)) {
      errors.push({ field: `points/${index}/targetAbwG`, message: 'Target ABW must increase' });
    }
    points.push({ doc: point.doc as number, targetAbwG: point.targetAbwG as number });
  });
  if (typeof data.onTrackBandPct !== 'number' || !Number.isFinite(data.onTrackBandPct)
    || data.onTrackBandPct < 1 || data.onTrackBandPct > 50) {
    errors.push({ field: 'onTrackBandPct', message: 'Enter 1–50%' });
  }
  if (errors.length) validation(errors);
  return { points, onTrackBandPct: data.onTrackBandPct as number };
}

function parseRules(body: unknown): RuleInput {
  const data = inputObject(body);
  const errors: { field: string; message: string }[] = [];
  for (const field of ['dailyReportDue', 'weeklyReportDueTime'] as const) {
    if (typeof data[field] !== 'string' || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(data[field])) {
      errors.push({ field, message: 'Must be HH:mm' });
    }
  }
  for (const field of ['weeklyReportDueWeekday', 'sensorDelayedAfterMinutes',
    'sensorOfflineAfterMinutes', 'attentionToAlertMinutes'] as const) {
    const max = field === 'weeklyReportDueWeekday' ? 7 : undefined;
    if (!Number.isSafeInteger(data[field]) || (data[field] as number) < 1
      || (max && (data[field] as number) > max)) {
      errors.push({ field, message: 'Must be a positive integer' });
    }
  }
  for (const field of ['productionAttentionPct', 'productionWarningPct'] as const) {
    if (typeof data[field] !== 'number' || !Number.isFinite(data[field]) || data[field] < 0) {
      errors.push({ field, message: 'Must be zero or greater' });
    }
  }
  if (typeof data.sensorDelayedAfterMinutes === 'number'
    && typeof data.sensorOfflineAfterMinutes === 'number'
    && data.sensorOfflineAfterMinutes <= data.sensorDelayedAfterMinutes) {
    errors.push({ field: 'sensorOfflineAfterMinutes', message: 'Must be longer than Delayed' });
  }
  if (typeof data.productionAttentionPct === 'number'
    && typeof data.productionWarningPct === 'number'
    && data.productionWarningPct <= data.productionAttentionPct) {
    errors.push({ field: 'productionWarningPct', message: 'Must be above Attention' });
  }
  if (errors.length) validation(errors);
  return data as unknown as RuleInput;
}

@Injectable()
export class AdminSettingsService {
  constructor(private readonly postgres: PostgresService) {}

  async getGrowth(actor: UserScope): Promise<SettingsMeta & { points: GrowthPoint[]; onTrackBandPct: number }> {
    await this.ensureGrowth(actor);
    const result = await this.postgres.pool.query<GrowthRow>(
      `SELECT s.id, s.on_track_band_pct, s.updated_at,
         u.public_id AS updated_by_id, u.name AS updated_by_name
       FROM growth_target_sets s JOIN users u ON u.id = s.updated_by
       WHERE s.company_id = $1 AND s.effective_to IS NULL`, [actor.companyId],
    );
    const row = result.rows[0];
    const points = await this.postgres.pool.query<{ doc: number; target_abw_g: string }>(
      'SELECT doc, target_abw_g FROM growth_target_points WHERE set_id = $1 ORDER BY doc',
      [row.id],
    );
    return { ...meta(row), onTrackBandPct: Number(row.on_track_band_pct),
      points: points.rows.map((point) => ({ doc: point.doc, targetAbwG: Number(point.target_abw_g) })) };
  }

  async putGrowth(actor: UserScope, body: unknown): ReturnType<AdminSettingsService['getGrowth']> {
    const data = parseGrowth(body);
    const client = await this.postgres.pool.connect();
    try {
      await client.query('BEGIN');
      await this.lockCompany(client, actor.companyId);
      const previous = await client.query<{ effective_to: Date }>(
        `UPDATE growth_target_sets SET effective_to = clock_timestamp()
         WHERE company_id = $1 AND effective_to IS NULL RETURNING effective_to`, [actor.companyId],
      );
      const at = previous.rows[0]?.effective_to ?? new Date();
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO growth_target_sets
          (company_id, on_track_band_pct, effective_from, updated_by)
         VALUES ($1, $2, $3, $4) RETURNING id`,
        [actor.companyId, data.onTrackBandPct, at, actor.actorId],
      );
      for (const point of data.points) await client.query(
        'INSERT INTO growth_target_points (set_id, doc, target_abw_g) VALUES ($1, $2, $3)',
        [inserted.rows[0].id, point.doc, point.targetAbwG],
      );
      await client.query('COMMIT');
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
    return this.getGrowth(actor);
  }

  async getRules(actor: UserScope): Promise<SettingsMeta & RuleInput> {
    await this.ensureRules(actor);
    const result = await this.postgres.pool.query<RuleRow>(
      `SELECT s.*, u.public_id AS updated_by_id, u.name AS updated_by_name
       FROM operational_rule_versions s JOIN users u ON u.id = s.updated_by
       WHERE s.company_id = $1 AND s.effective_to IS NULL`, [actor.companyId],
    );
    const row = result.rows[0];
    return { ...meta(row), dailyReportDue: row.daily_report_due.slice(0, 5),
      weeklyReportDueWeekday: row.weekly_report_due_weekday,
      weeklyReportDueTime: row.weekly_report_due_time.slice(0, 5),
      sensorDelayedAfterMinutes: row.sensor_delayed_after_minutes,
      sensorOfflineAfterMinutes: row.sensor_offline_after_minutes,
      attentionToAlertMinutes: row.attention_to_alert_minutes,
      productionAttentionPct: Number(row.production_attention_pct),
      productionWarningPct: Number(row.production_warning_pct) };
  }

  async putRules(actor: UserScope, body: unknown): ReturnType<AdminSettingsService['getRules']> {
    const data = parseRules(body);
    const client = await this.postgres.pool.connect();
    try {
      await client.query('BEGIN');
      await this.lockCompany(client, actor.companyId);
      const previous = await client.query<{ effective_to: Date }>(
        `UPDATE operational_rule_versions SET effective_to = clock_timestamp()
         WHERE company_id = $1 AND effective_to IS NULL RETURNING effective_to`, [actor.companyId],
      );
      await client.query(
        `INSERT INTO operational_rule_versions (company_id, daily_report_due,
           weekly_report_due_weekday, weekly_report_due_time, sensor_delayed_after_minutes,
           sensor_offline_after_minutes, attention_to_alert_minutes, production_attention_pct,
           production_warning_pct, effective_from, updated_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [actor.companyId, data.dailyReportDue, data.weeklyReportDueWeekday,
          data.weeklyReportDueTime, data.sensorDelayedAfterMinutes,
          data.sensorOfflineAfterMinutes, data.attentionToAlertMinutes,
          data.productionAttentionPct, data.productionWarningPct,
          previous.rows[0]?.effective_to ?? new Date(), actor.actorId],
      );
      await client.query('COMMIT');
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
    return this.getRules(actor);
  }

  private async ensureGrowth(actor: UserScope): Promise<void> {
    const client = await this.postgres.pool.connect();
    try {
      await client.query('BEGIN');
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO growth_target_sets
           (company_id, on_track_band_pct, effective_from, updated_by)
         VALUES ($1, 5, clock_timestamp(), $2)
         ON CONFLICT DO NOTHING RETURNING id`, [actor.companyId, actor.actorId],
      );
      if (inserted.rows[0]) for (const point of INITIAL_GROWTH) await client.query(
        'INSERT INTO growth_target_points (set_id, doc, target_abw_g) VALUES ($1, $2, $3)',
        [inserted.rows[0].id, point.doc, point.targetAbwG],
      );
      await client.query('COMMIT');
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }

  private async ensureRules(actor: UserScope): Promise<void> {
    const r = INITIAL_RULES;
    await this.postgres.pool.query(
      `INSERT INTO operational_rule_versions (company_id, daily_report_due,
         weekly_report_due_weekday, weekly_report_due_time, sensor_delayed_after_minutes,
         sensor_offline_after_minutes, attention_to_alert_minutes, production_attention_pct,
         production_warning_pct, effective_from, updated_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, clock_timestamp(), $10)
       ON CONFLICT DO NOTHING`,
      [actor.companyId, r.dailyReportDue, r.weeklyReportDueWeekday, r.weeklyReportDueTime,
        r.sensorDelayedAfterMinutes, r.sensorOfflineAfterMinutes, r.attentionToAlertMinutes,
        r.productionAttentionPct, r.productionWarningPct, actor.actorId],
    );
  }

  private async lockCompany(client: PoolClient, companyId: string): Promise<void> {
    await client.query('SELECT id FROM companies WHERE id = $1 FOR UPDATE', [companyId]);
  }
}
