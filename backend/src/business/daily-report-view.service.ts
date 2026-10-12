import { Injectable } from '@nestjs/common';
import { Principal } from '../auth/auth.service';
import { ApiProblem } from '../http/problem';
import { PostgresService } from '../infrastructure/postgres.service';
import { BusinessScopeService } from './business-scope.service';
import { DailyReportActivityService } from './daily-report-activity.service';
import { DailyReportPondsService } from './daily-report-ponds.service';
import { PondWaterQualityService } from './pond-water-quality.service';

interface ReportRow {
  id: string; public_id: string; status: 'draft' | 'submitted';
  farm_uuid: string; farm_id: string; farm_name: string; time_zone: string;
  date: string; manager_id: string; manager_name: string;
  submitted_at: Date | null; due_at: Date; saved_at: Date | null;
  weather: string | null; rainfall_mm: string | null;
  events: string | null; summary: string | null;
  frozen: Record<string, unknown> | null;
}
interface NeighborRow { public_id: string; date: string }
type Severity = 'normal' | 'attention' | 'warning' | 'critical';
const RANK: Record<Severity, number> = {
  normal: 0, attention: 1, warning: 2, critical: 3,
};

@Injectable()
export class DailyReportViewService {
  constructor(
    private readonly postgres: PostgresService,
    private readonly scope: BusinessScopeService,
    private readonly ponds: DailyReportPondsService,
    private readonly activity: DailyReportActivityService,
    private readonly water: PondWaterQualityService,
  ) {}

  async get(principal: Principal, reportId: string, language?: 'en' | 'id') {
    if (principal.role !== 'technical_manager' && principal.role !== 'farms_manager') {
      throw new ApiProblem(403, 'forbidden', 'Business access required');
    }
    const visible = await this.scope.visibleFarmIds(principal);
    const result = await this.postgres.pool.query<ReportRow>(
      `SELECT r.id,r.public_id,r.status,f.id AS farm_uuid,
         f.public_id AS farm_id,f.name AS farm_name,f.time_zone,
         to_char(r.report_date,'YYYY-MM-DD') AS date,
         u.public_id AS manager_id,u.name AS manager_name,
         r.submitted_at,r.due_at,r.saved_at,
         i.weather,i.rainfall_mm,i.events,i.summary,s.payload AS frozen
       FROM reports r JOIN farms f ON f.id=r.farm_id
       JOIN users u ON u.id=r.technical_manager_id
       LEFT JOIN daily_report_inputs i ON i.report_id=r.id
       LEFT JOIN report_snapshots s ON s.report_id=r.id
       WHERE r.public_id=$1 AND r.type='daily' AND f.company_id=$2
         AND f.public_id=ANY($3)`,
      [reportId, principal.companyId, visible],
    );
    const row = result.rows[0];
    if (!row || (principal.role === 'farms_manager' && row.status !== 'submitted')) {
      throw new ApiProblem(404, 'not_found', 'Report not found');
    }
    const neighbors = await this.postgres.pool.query<NeighborRow>(
      `SELECT public_id,to_char(report_date,'YYYY-MM-DD') AS date
       FROM reports WHERE farm_id=$1 AND type='daily' AND report_date<>$2::date
         AND ($3::boolean=false OR status='submitted')
       ORDER BY report_date`,
      [row.farm_uuid, row.date, principal.role === 'farms_manager'],
    );
    const previous = neighbors.rows.filter((item) => item.date < row.date).at(-1);
    const next = neighbors.rows.find((item) => item.date > row.date);
    const navigation = {
      previousReportId: previous?.public_id ?? null,
      nextReportId: next?.public_id ?? null,
      previousReportDate: previous?.date ?? null,
      nextReportDate: next?.date ?? null,
    };
    if (row.status === 'submitted') {
      if (!row.frozen) {
        throw new ApiProblem(503, 'report_snapshot_unavailable',
          'Submitted report snapshot is unavailable');
      }
      return { ...row.frozen, ...navigation };
    }
    const [ponds, activity, quality] = await Promise.all([
      this.ponds.snapshot(row.id, row.farm_uuid, row.date),
      this.activity.snapshot(row.id, row.farm_uuid, row.date, row.time_zone,
        new Date(), language),
      this.water.snapshot(principal, row.farm_id),
    ]);
    const farmStatus = quality.items.reduce<Severity>((status, item) =>
      RANK[item.status as Severity] > RANK[status] ? item.status as Severity : status,
    'normal');
    return {
      id: row.public_id, type: 'daily',
      farm: { id: row.farm_id, name: row.farm_name }, date: row.date,
      technicalManager: { id: row.manager_id, name: row.manager_name },
      status: row.status, submittedAt: null,
      dueAt: row.due_at.toISOString(), savedAt: row.saved_at?.toISOString() ?? null,
      farmStatus, ponds: ponds.ponds, totals: ponds.totals,
      environment: { weather: row.weather,
        rainfallMm: row.rainfall_mm === null ? null : Number(row.rainfall_mm),
        events: row.events },
      equipmentEvents: activity.equipmentEvents,
      alerts: activity.alerts, actions: activity.actions, summary: row.summary,
      ...navigation,
    };
  }
}
