import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { AdminSettingsService } from '../admin/admin-settings.service';
import { Principal } from '../auth/auth.service';
import { ApiProblem } from '../http/problem';
import { PostgresService } from '../infrastructure/postgres.service';
import { BusinessScopeService } from './business-scope.service';
import { DailyDraftSource, DailyReportViewService } from './daily-report-view.service';

interface FarmRow {
  id: string; public_id: string; name: string; time_zone: string;
  manager_id: string; manager_name: string;
}

function input(body: unknown): { farmId: string; date: string } {
  const value = typeof body === 'object' && body !== null && !Array.isArray(body)
    ? body as Record<string, unknown> : {};
  const errors: { field: string; message: string }[] = [];
  if (typeof value.farmId !== 'string' || !value.farmId.trim()) {
    errors.push({ field: 'farmId', message: 'Farm ID is required' });
  }
  if (typeof value.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value.date)
    || !Number.isFinite(Date.parse(`${value.date}T00:00:00Z`))
    || new Date(`${value.date}T00:00:00Z`).toISOString().slice(0, 10) !== value.date) {
    errors.push({ field: 'date', message: 'Valid date is required' });
  }
  if (errors.length) {
    throw new ApiProblem(422, 'validation_error', 'Invalid Daily Report request',
      { fieldErrors: errors });
  }
  return { farmId: value.farmId as string, date: value.date as string };
}

@Injectable()
export class DailyReportCreateService {
  constructor(
    private readonly postgres: PostgresService,
    private readonly scope: BusinessScopeService,
    private readonly settings: AdminSettingsService,
    private readonly view: DailyReportViewService,
  ) {}

  async create(principal: Principal, body: unknown, language?: 'en' | 'id') {
    if (principal.role !== 'technical_manager') {
      throw new ApiProblem(403, 'forbidden', 'Technical manager access required');
    }
    const { farmId, date } = input(body);
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
        `SELECT public_id FROM reports WHERE farm_id=$1 AND type='daily'
         AND report_date=$2::date`, [row.id, date],
      );
      if (found.rows[0]) {
        throw new ApiProblem(409, 'report_exists', 'A report for this date already exists',
          { existingReportId: found.rows[0].public_id });
      }
    };
    await conflict();
    const rules = await this.settings.getRules({
      companyId: principal.companyId, actorId: principal.userId,
    });
    const due = await this.postgres.pool.query<{ due_at: Date }>(
      `SELECT (($1::date + $2::time) AT TIME ZONE $3) AS due_at`,
      [date, rules.dailyReportDue, row.time_zone],
    );
    const reportUuid = randomUUID();
    const reportId = `daily-${randomUUID()}`;
    const draft: DailyDraftSource = {
      id: reportUuid, public_id: reportId, status: 'draft',
      farm_uuid: row.id, farm_id: row.public_id,
      farm_name: row.name, time_zone: row.time_zone, date,
      manager_id: row.manager_id, manager_name: row.manager_name,
      submitted_at: null, due_at: due.rows[0].due_at, saved_at: null,
      weather: null, rainfall_mm: null, events: null, summary: null,
    };
    // Build the full 201 response before persisting, so unavailable source data
    // cannot create a Draft while the client receives an error.
    const response = await this.view.renderDraft(principal, draft, language);
    try {
      await this.postgres.pool.query(
        `INSERT INTO reports
           (id,public_id,farm_id,type,report_date,technical_manager_id,due_at)
         VALUES ($1,$2,$3,'daily',$4::date,$5,$6)`,
        [reportUuid, reportId, row.id, date, principal.userId, draft.due_at],
      );
    } catch (error) {
      if ((error as { code?: string }).code === '23505') await conflict();
      throw error;
    }
    return response;
  }
}
