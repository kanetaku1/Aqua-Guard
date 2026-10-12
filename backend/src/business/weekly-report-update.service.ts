import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { PoolClient } from 'pg';
import { Principal } from '../auth/auth.service';
import { ApiProblem } from '../http/problem';
import { PostgresService } from '../infrastructure/postgres.service';
import { BusinessScopeService } from './business-scope.service';
import { parseWeeklyReportInput, WeeklyReportInput } from './weekly-report-input';
import { WeeklyReportViewService } from './weekly-report-view.service';

interface ReportRow {
  id: string; status: 'draft' | 'submitted'; farm_uuid: string;
  week_start: string; week_end: string; time_zone: string;
}
interface IdRow { id: string; public_id: string }

@Injectable()
export class WeeklyReportUpdateService {
  constructor(
    private readonly postgres: PostgresService,
    private readonly scope: BusinessScopeService,
    private readonly view: WeeklyReportViewService,
  ) {}

  async update(principal: Principal, reportId: string, body: unknown,
    language?: 'en' | 'id') {
    if (principal.role !== 'technical_manager') {
      throw new ApiProblem(403, 'forbidden', 'Technical manager access required');
    }
    const input = parseWeeklyReportInput(body);
    const visible = await this.scope.visibleFarmIds(principal);
    const current = await this.postgres.pool.query<{ status: string }>(
      `SELECT r.status FROM reports r JOIN farms f ON f.id=r.farm_id
       WHERE r.public_id=$1 AND r.type='weekly' AND f.company_id=$2
         AND f.public_id=ANY($3)`,
      [reportId, principal.companyId, visible],
    );
    if (!current.rows[0]) throw new ApiProblem(404, 'not_found', 'Report not found');
    if (current.rows[0].status !== 'draft') {
      throw new ApiProblem(409, 'report_submitted',
        'Submitted reports can no longer be edited');
    }
    // Verify that all derived sections can be rendered before writing inputs.
    await this.view.get(principal, reportId, language);
    const client = await this.postgres.pool.connect();
    try {
      await client.query('BEGIN');
      const target = await client.query<ReportRow>(
        `SELECT r.id,r.status,f.id AS farm_uuid,f.time_zone,
           to_char(r.week_start,'YYYY-MM-DD') AS week_start,
           to_char(r.week_end,'YYYY-MM-DD') AS week_end
         FROM reports r JOIN farms f ON f.id=r.farm_id
         WHERE r.public_id=$1 AND r.type='weekly' AND f.company_id=$2
           AND f.public_id=ANY($3) FOR UPDATE OF r`,
        [reportId, principal.companyId, visible],
      );
      const report = target.rows[0];
      if (!report) throw new ApiProblem(404, 'not_found', 'Report not found');
      if (report.status !== 'draft') {
        throw new ApiProblem(409, 'report_submitted',
          'Submitted reports can no longer be edited');
      }
      await this.save(client, report, input);
      await client.query(`UPDATE reports SET saved_at=now(),updated_at=now(),
        row_version=row_version+1 WHERE id=$1`, [report.id]);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      if ((error as { code?: string }).code === '23505') {
        throw new ApiProblem(422, 'validation_error', 'Duplicate manual event ID');
      }
      throw error;
    } finally {
      client.release();
    }
    return this.view.get(principal, reportId, language);
  }

  private async save(client: PoolClient, report: ReportRow,
    input: WeeklyReportInput) {
    const scalars: Record<string, string | null> = {
      ...(input.farmCondition !== undefined
        ? { farm_condition: input.farmCondition } : {}),
      ...(input.waterQualityComment !== undefined
        ? { water_quality_comment: input.waterQualityComment } : {}),
      ...(input.technicalSummary !== undefined
        ? { technical_summary: input.technicalSummary } : {}),
    };
    const columns = Object.keys(scalars);
    if (columns.length) {
      await client.query(
        `INSERT INTO weekly_report_inputs (report_id,${columns.join(',')})
         VALUES ($1,${columns.map((_, index) => `$${index + 2}`).join(',')})
         ON CONFLICT (report_id) DO UPDATE SET
           ${columns.map((column) => `${column}=EXCLUDED.${column}`).join(',')}`,
        [report.id, ...columns.map((column) => scalars[column])],
      );
    }
    if (input.alertNotes !== undefined) {
      const ids = input.alertNotes.map((row) => row.alertId);
      const alerts = ids.length ? await client.query<IdRow>(
        `SELECT al.id,al.public_id FROM alerts al
         JOIN ponds p ON p.id=al.pond_id
         JOIN farms f ON f.id=p.farm_id
         WHERE p.farm_id=$1 AND al.public_id=ANY($2::text[])
           AND al.occurred_at <
             ((($3::date + 7) + time '00:00') AT TIME ZONE f.time_zone)
           AND (al.resolved_at IS NULL OR al.resolved_at >=
             (($3::date + time '00:00') AT TIME ZONE f.time_zone))`,
        [report.farm_uuid, ids, report.week_start],
      ) : { rows: [] as IdRow[] };
      if (alerts.rows.length !== ids.length) {
        throw new ApiProblem(422, 'validation_error', 'Invalid Weekly Report input',
          { fieldErrors: [{ field: 'alertNotes',
            message: 'Alert is not in this Farm or reporting week' }] });
      }
      const byPublicId = new Map(alerts.rows.map((row) => [row.public_id, row.id]));
      await client.query('DELETE FROM weekly_report_alert_notes WHERE report_id=$1',
        [report.id]);
      for (const note of input.alertNotes) {
        await client.query(`INSERT INTO weekly_report_alert_notes
          (report_id,alert_id,cause,action,outcome) VALUES ($1,$2,$3,$4,$5)`,
        [report.id, byPublicId.get(note.alertId),
          note.cause, note.action, note.outcome]);
      }
    }
    if (input.majorActions !== undefined) {
      const pondIds = [...new Set(input.majorActions.map((row) => row.pondId)
        .filter((id): id is string => id !== null))];
      const ponds = pondIds.length ? await client.query<IdRow>(
        `SELECT id,public_id FROM ponds WHERE farm_id=$1 AND public_id=ANY($2::text[])`,
        [report.farm_uuid, pondIds],
      ) : { rows: [] as IdRow[] };
      if (ponds.rows.length !== pondIds.length) {
        throw new ApiProblem(422, 'validation_error', 'Invalid Weekly Report input',
          { fieldErrors: [{ field: 'majorActions',
            message: 'Pond is not in this Farm' }] });
      }
      const byPublicId = new Map(ponds.rows.map((row) => [row.public_id, row.id]));
      for (const [index, action] of input.majorActions.entries()) {
        if (action.date < report.week_start || action.date > report.week_end) {
          throw new ApiProblem(422, 'validation_error', 'Invalid Weekly Report input',
            { fieldErrors: [{ field: `majorActions/${index}/date`,
              message: 'Date is outside the reporting week' }] });
        }
      }
      await client.query('DELETE FROM weekly_report_major_actions WHERE report_id=$1',
        [report.id]);
      for (const [index, action] of input.majorActions.entries()) {
        await client.query(`INSERT INTO weekly_report_major_actions
          (public_id,report_id,action_date,pond_id,action,sort_order)
          VALUES ($1,$2,$3::date,$4,$5,$6)`,
        [action.id ?? `wa-${randomUUID()}`, report.id, action.date,
          action.pondId ? byPublicId.get(action.pondId) : null,
          action.action, index]);
      }
    }
  }
}
