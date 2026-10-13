import { Injectable } from '@nestjs/common';
import { PoolClient } from 'pg';
import { Principal } from '../auth/auth.service';
import { ApiProblem } from '../http/problem';
import { PostgresService } from '../infrastructure/postgres.service';
import { BusinessScopeService } from './business-scope.service';
import { DailyReportViewService } from './daily-report-view.service';

interface ReportRow {
  id: string; type: string; status: 'draft' | 'submitted';
  weather: string | null; summary: string | null;
}

@Injectable()
export class DailyReportSubmitService {
  constructor(
    private readonly postgres: PostgresService,
    private readonly scope: BusinessScopeService,
    private readonly view: DailyReportViewService,
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
        `SELECT r.id,r.type,r.status,i.weather,i.summary
         FROM reports r JOIN farms f ON f.id=r.farm_id
         LEFT JOIN daily_report_inputs i ON i.report_id=r.id
         WHERE r.public_id=$1 AND f.company_id=$2 AND f.public_id=ANY($3)
         FOR UPDATE OF r`,
        [reportId, principal.companyId, visible],
      );
      const row = result.rows[0];
      if (!row || row.type !== 'daily') {
        throw new ApiProblem(404, 'not_found', 'Report not found');
      }
      if (row.status !== 'draft') {
        throw new ApiProblem(409, 'report_submitted', 'Report is already submitted');
      }
      const missing = [] as { field: string; message: string }[];
      if (!row.weather) missing.push({ field: 'environment/weather', message: 'Required' });
      if (!row.summary?.trim()) missing.push({ field: 'summary', message: 'Required' });
      if (missing.length) {
        throw new ApiProblem(422, 'validation_error', 'Report is incomplete',
          { fieldErrors: missing });
      }
      // The row lock prevents a concurrent PATCH from changing inputs while
      // the Draft body is collected from its source records.
      const draft = (await this.view.get(principal, reportId, language)) as
        Awaited<ReturnType<DailyReportViewService['renderDraft']>>;
      const submittedAt = new Date();
      const snapshot = { ...draft, status: 'submitted' as const,
        submittedAt: submittedAt.toISOString(), savedAt: submittedAt.toISOString() };
      await this.persist(client, row.id, snapshot, submittedAt, principal.userId);
      await client.query('COMMIT');
      return {
        id: snapshot.id, type: snapshot.type, farm: snapshot.farm,
        date: snapshot.date, technicalManager: snapshot.technicalManager,
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

  private async persist(client: PoolClient, reportUuid: string,
    snapshot: Record<string, unknown>, submittedAt: Date, userId: string) {
    await client.query(
      `INSERT INTO report_snapshots
         (report_id,schema_version,payload,source_cutoff_at,influx_queried_at)
       VALUES ($1,'daily-v1',$2::jsonb,$3,$3)`,
      [reportUuid, JSON.stringify(snapshot), submittedAt],
    );
    await client.query(
      `UPDATE reports SET status='submitted',submitted_at=$2,submitted_by=$3,
         saved_at=$2,updated_at=$2,row_version=row_version+1 WHERE id=$1`,
      [reportUuid, submittedAt, userId],
    );
  }
}
