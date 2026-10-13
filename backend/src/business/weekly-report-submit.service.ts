import { Injectable } from '@nestjs/common';
import { Principal } from '../auth/auth.service';
import { ApiProblem } from '../http/problem';
import { PostgresService } from '../infrastructure/postgres.service';
import { BusinessScopeService } from './business-scope.service';
import { WeeklyReportViewService } from './weekly-report-view.service';

interface ReportRow {
  id: string; status: 'draft' | 'submitted'; technical_summary: string | null;
}

@Injectable()
export class WeeklyReportSubmitService {
  constructor(
    private readonly postgres: PostgresService,
    private readonly scope: BusinessScopeService,
    private readonly view: WeeklyReportViewService,
  ) {}

  async submit(principal: Principal, reportId: string, language?: 'en' | 'id') {
    if (principal.role !== 'technical_manager') {
      throw new ApiProblem(403, 'forbidden', 'Technical manager access required');
    }
    const visible = await this.scope.visibleFarmIds(principal);
    const client = await this.postgres.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query<ReportRow>(
        `SELECT r.id,r.status,i.technical_summary
         FROM reports r JOIN farms f ON f.id=r.farm_id
         LEFT JOIN weekly_report_inputs i ON i.report_id=r.id
         WHERE r.public_id=$1 AND r.type='weekly' AND f.company_id=$2
           AND f.public_id=ANY($3) FOR UPDATE OF r`,
        [reportId, principal.companyId, visible],
      );
      const row = result.rows[0];
      if (!row) throw new ApiProblem(404, 'not_found', 'Report not found');
      if (row.status !== 'draft') {
        throw new ApiProblem(409, 'report_submitted', 'Report is already submitted');
      }
      if (!row.technical_summary?.trim()) {
        throw new ApiProblem(422, 'validation_error', 'Report is incomplete',
          { fieldErrors: [{ field: 'technicalSummary', message: 'Required' }] });
      }
      const draft = (await this.view.get(principal, reportId, language)) as
        Awaited<ReturnType<WeeklyReportViewService['renderDraft']>>;
      const submittedAt = new Date();
      const snapshot = { ...draft, status: 'submitted' as const,
        submittedAt: submittedAt.toISOString(), savedAt: submittedAt.toISOString() };
      await client.query(
        `INSERT INTO report_snapshots
           (report_id,schema_version,payload,source_cutoff_at,influx_queried_at)
         VALUES ($1,'weekly-v1',$2::jsonb,$3,$3)`,
        [row.id, JSON.stringify(snapshot), submittedAt],
      );
      await client.query(
        `UPDATE reports SET status='submitted',submitted_at=$2,submitted_by=$3,
           saved_at=$2,updated_at=$2,row_version=row_version+1 WHERE id=$1`,
        [row.id, submittedAt, principal.userId],
      );
      await client.query('COMMIT');
      return {
        id: snapshot.id, type: snapshot.type, farm: snapshot.farm,
        weekStart: snapshot.weekStart, weekEnd: snapshot.weekEnd,
        technicalManager: snapshot.technicalManager,
        status: snapshot.status, submittedAt: snapshot.submittedAt,
        dueAt: snapshot.dueAt, savedAt: snapshot.savedAt,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}
