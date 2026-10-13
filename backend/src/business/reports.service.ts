import { Injectable } from '@nestjs/common';
import { Principal } from '../auth/auth.service';
import { ApiProblem } from '../http/problem';
import { PostgresService } from '../infrastructure/postgres.service';
import { BusinessScopeService } from './business-scope.service';

interface ReportRow {
  public_id: string; type: 'daily' | 'weekly'; status: 'draft' | 'submitted';
  farm_id: string; farm_name: string;
  report_date: string | null; week_start: string | null; week_end: string | null;
  manager_id: string; manager_name: string;
  due_at: Date; saved_at: Date | null; submitted_at: Date | null;
}

const FROM = `FROM reports r JOIN farms f ON f.id=r.farm_id
  JOIN users u ON u.id=r.technical_manager_id`;
const WHERE = `WHERE f.company_id=$1 AND f.public_id=ANY($2)
  AND ($3::text IS NULL OR f.public_id=$3)
  AND r.type=$4
  AND ($5::text IS NULL OR r.status=$5)
  AND ($6::date IS NULL OR COALESCE(r.report_date,r.week_start)>=$6::date)
  AND ($7::date IS NULL OR COALESCE(r.report_date,r.week_start)<=$7::date)
  AND ($8::boolean = false OR r.status='submitted')`;

function invalid(field: string, message: string): never {
  throw new ApiProblem(422, 'validation_error', 'Invalid report query', {
    fieldErrors: [{ field, message }],
  });
}

function optionalDate(value: unknown, field: string): string | null {
  if (value === undefined) return null;
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\d$/.test(value)) {
    return invalid(field, 'Must be a valid date');
  }
  const parsed = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    return invalid(field, 'Must be a valid date');
  }
  return value;
}

function positiveInteger(value: unknown, field: string, fallback: number,
  maximum: number): number {
  if (value === undefined) return fallback;
  const parsed = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : NaN;
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > maximum) {
    return invalid(field, `Must be an integer from 1 to ${maximum}`);
  }
  return parsed;
}

@Injectable()
export class ReportsService {
  constructor(
    private readonly postgres: PostgresService,
    private readonly scope: BusinessScopeService,
  ) {}

  async list(principal: Principal, query: Record<string, unknown>) {
    if (principal.role !== 'farms_manager' && principal.role !== 'technical_manager') {
      throw new ApiProblem(403, 'forbidden', 'Business access required');
    }
    const type = query.type;
    if (type !== 'daily' && type !== 'weekly') invalid('type', 'Must be daily or weekly');
    const farmId = query.farmId === undefined ? null : query.farmId;
    if (farmId !== null && (typeof farmId !== 'string' || !farmId)) {
      invalid('farmId', 'Must be a Farm ID');
    }
    const status = query.status === undefined ? null : query.status;
    if (status !== null && status !== 'draft' && status !== 'submitted') {
      invalid('status', 'Must be draft or submitted');
    }
    const from = optionalDate(query.from, 'from');
    const to = optionalDate(query.to, 'to');
    if (from && to && from > to) invalid('to', 'Must be on or after from');
    const page = positiveInteger(query.page, 'page', 1, 1_000_000);
    const pageSize = positiveInteger(query.pageSize, 'pageSize', 20, 100);
    const visible = await this.scope.visibleFarmIds(principal);
    if (principal.role === 'farms_manager' && status === 'draft') {
      return { page, pageSize, total: 0, items: [] };
    }
    const args = [principal.companyId, visible, farmId, type, status, from, to,
      principal.role === 'farms_manager'];
    const [count, records] = await Promise.all([
      this.postgres.pool.query<{ total: string }>(
        `SELECT count(*)::text AS total ${FROM} ${WHERE}`, args),
      this.postgres.pool.query<ReportRow>(
        `SELECT r.public_id,r.type,r.status,f.public_id AS farm_id,f.name AS farm_name,
           to_char(r.report_date,'YYYY-MM-DD') AS report_date,
           to_char(r.week_start,'YYYY-MM-DD') AS week_start,
           to_char(r.week_end,'YYYY-MM-DD') AS week_end,
           u.public_id AS manager_id,u.name AS manager_name,
           r.due_at,r.saved_at,r.submitted_at
         ${FROM} ${WHERE}
         ORDER BY COALESCE(r.report_date,r.week_start) DESC,r.id DESC
         LIMIT $9 OFFSET $10`, [...args, pageSize, (page - 1) * pageSize]),
    ]);
    return { page, pageSize, total: Number(count.rows[0].total),
      items: records.rows.map((row) => ({
        id: row.public_id, type: row.type,
        farm: { id: row.farm_id, name: row.farm_name },
        ...(row.type === 'daily' ? { date: row.report_date }
          : { weekStart: row.week_start, weekEnd: row.week_end }),
        status: row.status,
        technicalManager: { id: row.manager_id, name: row.manager_name },
        submittedAt: row.submitted_at?.toISOString() ?? null,
        dueAt: row.due_at.toISOString(),
        savedAt: row.saved_at?.toISOString() ?? null,
      })) };
  }
}
