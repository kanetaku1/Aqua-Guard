import { Injectable } from '@nestjs/common';
import { AdminSettingsService } from '../admin/admin-settings.service';
import { Principal } from '../auth/auth.service';
import { ApiProblem } from '../http/problem';
import { PostgresService } from '../infrastructure/postgres.service';
import { BusinessScopeService } from './business-scope.service';

interface FarmRow { id: string; name: string; time_zone: string }
interface DueRow { daily_due: Date; weekly_due: Date }
interface ReportRow {
  public_id: string; type: 'daily' | 'weekly'; status: 'draft' | 'submitted';
  report_date: string | null; week_start: string | null; week_end: string | null;
  due_at: Date; saved_at: Date | null; submitted_at: Date | null;
  manager_id?: string; manager_name?: string;
}

function localDate(now: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000)
    .toISOString().slice(0, 10);
}

function weeklyStart(today: string): string {
  const weekday = new Date(`${today}T00:00:00Z`).getUTCDay();
  return addDays(today, -(weekday === 0 ? 6 : weekday - 1));
}

function status(row: ReportRow | undefined, due: Date, now: Date) {
  if (row?.status === 'submitted') return 'submitted';
  if (now > (row?.due_at ?? due)) return 'overdue';
  return row ? 'draft' : 'not_started';
}

@Injectable()
export class FarmReportStatusService {
  constructor(
    private readonly postgres: PostgresService,
    private readonly scope: BusinessScopeService,
    private readonly settings: AdminSettingsService,
  ) {}

  async get(principal: Principal, farmId: string, now = new Date()) {
    if (principal.role !== 'technical_manager') {
      throw new ApiProblem(403, 'forbidden', 'Technical manager access required');
    }
    const visible = await this.scope.visibleFarmIds(principal);
    const farm = await this.postgres.pool.query<FarmRow>(
      `SELECT id,name,time_zone FROM farms
       WHERE public_id=$1 AND company_id=$2 AND public_id=ANY($3)`,
      [farmId, principal.companyId, visible],
    );
    const currentFarm = farm.rows[0];
    if (!currentFarm) throw new ApiProblem(404, 'not_found', 'Farm not found');
    const today = localDate(now, currentFarm.time_zone);
    const weekStart = weeklyStart(today);
    const weekEnd = addDays(weekStart, 6);
    const [rules, current, latest] = await Promise.all([
      this.settings.getRules({ companyId: principal.companyId, actorId: principal.userId }),
      this.postgres.pool.query<ReportRow>(
        `SELECT public_id,type,status,to_char(report_date,'YYYY-MM-DD') AS report_date,
           to_char(week_start,'YYYY-MM-DD') AS week_start,
           to_char(week_end,'YYYY-MM-DD') AS week_end,
           due_at,saved_at,submitted_at
         FROM reports WHERE farm_id=$1 AND
           ((type='daily' AND report_date=$2::date)
             OR (type='weekly' AND week_start=$3::date))`,
        [currentFarm.id, today, weekStart],
      ),
      this.postgres.pool.query<ReportRow>(
        `SELECT r.public_id,r.type,r.status,
           to_char(r.report_date,'YYYY-MM-DD') AS report_date,
           to_char(r.week_start,'YYYY-MM-DD') AS week_start,
           to_char(r.week_end,'YYYY-MM-DD') AS week_end,
           r.due_at,r.saved_at,r.submitted_at,
           u.public_id AS manager_id,u.name AS manager_name
         FROM reports r JOIN users u ON u.id=r.technical_manager_id
         WHERE r.farm_id=$1 AND r.status='submitted'
         ORDER BY r.submitted_at DESC,r.id DESC LIMIT 1`, [currentFarm.id],
      ),
    ]);
    const weeklyDueDate = addDays(weekStart, rules.weeklyReportDueWeekday - 1);
    const due = await this.postgres.pool.query<DueRow>(
      `SELECT (($1::date + $2::time) AT TIME ZONE $3) AS daily_due,
         (($4::date + $5::time) AT TIME ZONE $3) AS weekly_due`,
      [today, rules.dailyReportDue, currentFarm.time_zone,
        weeklyDueDate, rules.weeklyReportDueTime],
    );
    const daily = current.rows.find((row) => row.type === 'daily');
    const weekly = current.rows.find((row) => row.type === 'weekly');
    const dailyDue = due.rows[0].daily_due;
    const weeklyDue = due.rows[0].weekly_due;
    const last = latest.rows[0];
    return {
      dailyToday: {
        reportId: daily?.public_id ?? null,
        state: status(daily, dailyDue, now), date: today,
        dueAt: (daily?.due_at ?? dailyDue).toISOString(),
        savedAt: daily?.saved_at?.toISOString() ?? null,
      },
      weeklyThisWeek: {
        reportId: weekly?.public_id ?? null,
        state: status(weekly, weeklyDue, now), weekStart, weekEnd,
        dueAt: (weekly?.due_at ?? weeklyDue).toISOString(),
        savedAt: weekly?.saved_at?.toISOString() ?? null,
      },
      lastSubmitted: last ? {
        id: last.public_id, type: last.type,
        farm: { id: farmId, name: currentFarm.name },
        ...(last.type === 'daily' ? { date: last.report_date }
          : { weekStart: last.week_start, weekEnd: last.week_end }),
        status: last.status,
        technicalManager: { id: last.manager_id, name: last.manager_name },
        submittedAt: last.submitted_at!.toISOString(),
        dueAt: last.due_at.toISOString(),
        savedAt: last.saved_at?.toISOString() ?? null,
      } : null,
    };
  }
}
