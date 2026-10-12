import { Injectable } from '@nestjs/common';
import { Principal } from '../auth/auth.service';
import { ApiProblem } from '../http/problem';
import { PostgresService } from '../infrastructure/postgres.service';
import { BusinessScopeService } from './business-scope.service';
import { FarmProductionService } from './farm-production.service';
import { FarmStatusService } from './farm-status.service';
import { WeeklyLaboratoryService } from './weekly-laboratory.service';
import { WeeklyReportActivityService } from './weekly-report-activity.service';
import { WeeklyReportTotalsService } from './weekly-report-totals.service';
import { WeeklySamplingCoverageService } from './weekly-sampling-coverage.service';
import { WeeklyWaterQualityService } from './weekly-water-quality.service';

export interface WeeklyDraftSource {
  id: string; public_id: string; status: 'draft' | 'submitted';
  farm_uuid: string; farm_id: string; farm_name: string; time_zone: string;
  week_start: string; week_end: string;
  manager_id: string; manager_name: string;
  submitted_at: Date | null; due_at: Date; saved_at: Date | null;
  farm_condition: 'normal' | 'attention' | 'warning' | 'critical' | null;
  water_quality_comment: string | null; technical_summary: string | null;
}
interface ReportRow extends WeeklyDraftSource {
  frozen: Record<string, unknown> | null;
}
interface NeighborRow { public_id: string; week_start: string }

@Injectable()
export class WeeklyReportViewService {
  constructor(
    private readonly postgres: PostgresService,
    private readonly scope: BusinessScopeService,
    private readonly production: FarmProductionService,
    private readonly farmStatus: FarmStatusService,
    private readonly totals: WeeklyReportTotalsService,
    private readonly coverage: WeeklySamplingCoverageService,
    private readonly water: WeeklyWaterQualityService,
    private readonly laboratory: WeeklyLaboratoryService,
    private readonly activity: WeeklyReportActivityService,
  ) {}

  private async systemStatus(principal: Principal, row: WeeklyDraftSource) {
    const today = new Intl.DateTimeFormat('sv-SE',
      { timeZone: row.time_zone }).format(new Date());
    if (row.week_end >= today) {
      return (await this.farmStatus.detail(principal, row.farm_id)).status;
    }
    const result = await this.postgres.pool.query<{ status: string }>(
      `SELECT status FROM farm_status_daily
       WHERE farm_id=$1 AND status_date=$2::date`,
      [row.farm_uuid, row.week_end],
    );
    if (!result.rows[0]) {
      throw new ApiProblem(503, 'weekly_report_data_not_ready',
        'Farm status was not observed at the end of the reporting week');
    }
    return result.rows[0].status;
  }

  async get(principal: Principal, reportId: string, language?: 'en' | 'id') {
    const visible = await this.scope.visibleFarmIds(principal);
    const result = await this.postgres.pool.query<ReportRow>(
      `SELECT r.id,r.public_id,r.status,f.id AS farm_uuid,
         f.public_id AS farm_id,f.name AS farm_name,f.time_zone,
         to_char(r.week_start,'YYYY-MM-DD') AS week_start,
         to_char(r.week_end,'YYYY-MM-DD') AS week_end,
         u.public_id AS manager_id,u.name AS manager_name,
         r.submitted_at,r.due_at,r.saved_at,
         i.farm_condition,i.water_quality_comment,i.technical_summary,
         s.payload AS frozen
       FROM reports r JOIN farms f ON f.id=r.farm_id
       JOIN users u ON u.id=r.technical_manager_id
       LEFT JOIN weekly_report_inputs i ON i.report_id=r.id
       LEFT JOIN report_snapshots s ON s.report_id=r.id
       WHERE r.public_id=$1 AND r.type='weekly' AND f.company_id=$2
         AND f.public_id=ANY($3)`,
      [reportId, principal.companyId, visible],
    );
    const row = result.rows[0];
    if (!row || (principal.role === 'farms_manager' && row.status !== 'submitted')) {
      throw new ApiProblem(404, 'not_found', 'Report not found');
    }
    if (row.status === 'submitted') {
      if (!row.frozen) {
        throw new ApiProblem(503, 'report_snapshot_unavailable',
          'Submitted report snapshot is unavailable');
      }
      return { ...row.frozen,
        ...await this.navigation(row.farm_uuid, row.week_start, true) };
    }
    return this.renderDraft(principal, row, language);
  }

  private async navigation(farmUuid: string, weekStart: string,
    submittedOnly: boolean) {
    const neighbors = await this.postgres.pool.query<NeighborRow>(
      `SELECT public_id,to_char(week_start,'YYYY-MM-DD') AS week_start
       FROM reports WHERE farm_id=$1 AND type='weekly'
         AND week_start<>$2::date
         AND ($3::boolean=false OR status='submitted')
       ORDER BY week_start`, [farmUuid, weekStart, submittedOnly],
    );
    const previous = neighbors.rows.filter((row) => row.week_start < weekStart).at(-1);
    const next = neighbors.rows.find((row) => row.week_start > weekStart);
    return { previousReportId: previous?.public_id ?? null,
      nextReportId: next?.public_id ?? null };
  }

  async renderDraft(principal: Principal, row: WeeklyDraftSource,
    language?: 'en' | 'id') {
    const [production, systemFarmStatus, totals, coverage, water, lab, activity, navigation] =
      await Promise.all([
        this.production.get(principal, row.farm_id, row.week_end),
        this.systemStatus(principal, row),
        this.totals.snapshot(row.farm_uuid, row.week_start),
        this.coverage.snapshot(row.farm_uuid, row.week_start),
        this.water.snapshot(principal.companyId, row.farm_uuid,
          row.farm_id, row.time_zone, row.week_start),
        this.laboratory.snapshot(principal.companyId,
          row.farm_uuid, row.week_start),
        this.activity.snapshot(row.id, row.farm_uuid, row.week_start,
          row.time_zone, new Date(), language),
        this.navigation(row.farm_uuid, row.week_start, false),
      ]);
    const qualityByPond = new Map(water.map((item) => [item.pond.id, item.waterQuality]));
    const labByPond = new Map(lab.map((item) => [item.pond.id, item.laboratory]));
    if (production.ponds.length !== water.length || production.ponds.length !== lab.length
      || production.ponds.some((pond) => !qualityByPond.has(pond.pond.id)
        || !labByPond.has(pond.pond.id))) {
      throw new ApiProblem(503, 'weekly_report_data_not_ready',
        'Production, water quality and laboratory Pond sets differ');
    }
    const docs = production.ponds.map((pond) => pond.doc);
    const pondsThisWeek = production.ponds.map((pond) => ({
      pond: pond.pond, growth: pond,
      waterQuality: qualityByPond.get(pond.pond.id)!,
      laboratory: labByPond.get(pond.pond.id)!,
    }));
    return {
      id: row.public_id, type: 'weekly',
      farm: { id: row.farm_id, name: row.farm_name },
      weekStart: row.week_start, weekEnd: row.week_end,
      status: row.status,
      technicalManager: { id: row.manager_id, name: row.manager_name },
      submittedAt: row.submitted_at?.toISOString() ?? null,
      dueAt: row.due_at.toISOString(), savedAt: row.saved_at?.toISOString() ?? null,
      ...navigation,
      docRange: { min: Math.min(...docs), max: Math.max(...docs) },
      summary: {
        farmCondition: row.farm_condition ?? systemFarmStatus,
        systemFarmStatus,
        pondsBehind: production.kpis.growthDistribution.behind,
        pondsTotal: production.ponds.length,
        feedKg: totals.feeding.total,
        mortalityPcs: totals.mortality.total,
        mortalityKg: totals.mortality.totalKg,
        alertCount: activity.alerts.length,
        alertsOngoing: activity.alerts.filter((alert) =>
          alert.state !== 'resolved').length,
      },
      samplingCoverage: coverage, production,
      feeding: totals.feeding, mortality: totals.mortality,
      pondsThisWeek,
      alerts: activity.alerts, majorActions: activity.majorActions,
      waterQualityComment: row.water_quality_comment,
      technicalSummary: row.technical_summary,
    };
  }
}
