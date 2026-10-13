import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { AdminSettingsService } from '../admin/admin-settings.service';
import { Principal } from '../auth/auth.service';
import { ApiProblem } from '../http/problem';
import { PostgresService } from '../infrastructure/postgres.service';
import { BusinessScopeService } from './business-scope.service';
import { WeeklyDraftSource, WeeklyReportViewService } from './weekly-report-view.service';

interface FarmRow {
  id: string; public_id: string; name: string; time_zone: string;
  manager_id: string; manager_name: string;
}

function shift(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000)
    .toISOString().slice(0, 10);
}
function input(body: unknown): { farmId: string; weekStart: string } {
  const raw = body && typeof body === 'object' && !Array.isArray(body)
    ? body as Record<string, unknown> : {};
  const errors: { field: string; message: string }[] = [];
  if (typeof raw.farmId !== 'string' || !raw.farmId.trim()) {
    errors.push({ field: 'farmId', message: 'Farm ID is required' });
  }
  const weekStart = raw.weekStart;
  const parsed = typeof weekStart === 'string'
    ? Date.parse(`${weekStart}T00:00:00Z`) : NaN;
  if (typeof weekStart !== 'string'
    || !/^\d{4}-\d\d-\d\d$/.test(weekStart)
    || !Number.isFinite(parsed)
    || new Date(parsed).toISOString().slice(0, 10) !== weekStart
    || new Date(parsed).getUTCDay() !== 1) {
    errors.push({ field: 'weekStart', message: 'Must be a Monday date' });
  }
  if (errors.length) {
    throw new ApiProblem(422, 'validation_error', 'Invalid Weekly Report request',
      { fieldErrors: errors });
  }
  return { farmId: raw.farmId as string, weekStart: weekStart as string };
}

@Injectable()
export class WeeklyReportCreateService {
  constructor(
    private readonly postgres: PostgresService,
    private readonly scope: BusinessScopeService,
    private readonly settings: AdminSettingsService,
    private readonly view: WeeklyReportViewService,
  ) {}

  async create(principal: Principal, body: unknown, language?: 'en' | 'id') {
    if (principal.role !== 'technical_manager') {
      throw new ApiProblem(403, 'forbidden', 'Technical manager access required');
    }
    const { farmId, weekStart } = input(body);
    const visible = await this.scope.visibleFarmIds(principal);
    const farm = await this.postgres.pool.query<FarmRow>(
      `SELECT f.id,f.public_id,f.name,f.time_zone,
         u.public_id AS manager_id,u.name AS manager_name
       FROM farms f JOIN users u ON u.id=$4 AND u.company_id=f.company_id
       WHERE f.public_id=$1 AND f.company_id=$2 AND f.public_id=ANY($3)`,
      [farmId, principal.companyId, visible, principal.userId],
    );
    const row = farm.rows[0];
    if (!row) throw new ApiProblem(404, 'not_found', 'Farm not found');
    const conflict = async () => {
      const found = await this.postgres.pool.query<{ public_id: string }>(
        `SELECT public_id FROM reports WHERE farm_id=$1 AND type='weekly'
         AND week_start=$2::date`, [row.id, weekStart],
      );
      if (found.rows[0]) {
        throw new ApiProblem(409, 'report_exists',
          'A report for this week already exists',
          { existingReportId: found.rows[0].public_id });
      }
    };
    await conflict();
    const rules = await this.settings.getRules({
      companyId: principal.companyId, actorId: principal.userId,
    });
    const weekEnd = shift(weekStart, 6);
    const dueDate = shift(weekStart, 7 + rules.weeklyReportDueWeekday - 1);
    const due = await this.postgres.pool.query<{ due_at: Date }>(
      `SELECT (($1::date + $2::time) AT TIME ZONE $3) AS due_at`,
      [dueDate, rules.weeklyReportDueTime, row.time_zone],
    );
    const reportUuid = randomUUID();
    const reportId = `weekly-${randomUUID()}`;
    const draft: WeeklyDraftSource = {
      id: reportUuid, public_id: reportId, status: 'draft',
      farm_uuid: row.id, farm_id: row.public_id,
      farm_name: row.name, time_zone: row.time_zone,
      week_start: weekStart, week_end: weekEnd,
      manager_id: row.manager_id, manager_name: row.manager_name,
      submitted_at: null, due_at: due.rows[0].due_at, saved_at: null,
      farm_condition: null, water_quality_comment: null, technical_summary: null,
    };
    const response = await this.view.renderDraft(principal, draft, language);
    try {
      await this.postgres.pool.query(
        `INSERT INTO reports
           (id,public_id,farm_id,type,week_start,week_end,technical_manager_id,due_at)
         VALUES ($1,$2,$3,'weekly',$4::date,$5::date,$6,$7)`,
        [reportUuid, reportId, row.id, weekStart, weekEnd,
          principal.userId, draft.due_at],
      );
    } catch (error) {
      if ((error as { code?: string }).code === '23505') await conflict();
      throw error;
    }
    return response;
  }
}
