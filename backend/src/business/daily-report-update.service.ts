import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { PoolClient } from 'pg';
import { Principal } from '../auth/auth.service';
import { ApiProblem } from '../http/problem';
import { PostgresService } from '../infrastructure/postgres.service';
import { BusinessScopeService } from './business-scope.service';
import { DailyReportInput, parseDailyReportInput } from './daily-report-input';
import { DailyReportViewService } from './daily-report-view.service';

interface ReportRow { id: string; farm_uuid: string; status: 'draft' | 'submitted' }
interface IdRow { id: string; public_id: string }

@Injectable()
export class DailyReportUpdateService {
  constructor(
    private readonly postgres: PostgresService,
    private readonly scope: BusinessScopeService,
    private readonly view: DailyReportViewService,
  ) {}

  async update(principal: Principal, reportId: string, body: unknown,
    language?: 'en' | 'id') {
    if (principal.role !== 'technical_manager') {
      throw new ApiProblem(403, 'forbidden', 'Technical manager access required');
    }
    const input = parseDailyReportInput(body);
    const visible = await this.scope.visibleFarmIds(principal);
    const current = await this.postgres.pool.query<{ status: 'draft' | 'submitted' }>(
      `SELECT r.status FROM reports r JOIN farms f ON f.id=r.farm_id
       WHERE r.public_id=$1 AND r.type='daily' AND f.company_id=$2
         AND f.public_id=ANY($3)`,
      [reportId, principal.companyId, visible],
    );
    if (!current.rows[0]) throw new ApiProblem(404, 'not_found', 'Report not found');
    if (current.rows[0].status !== 'draft') {
      throw new ApiProblem(409, 'report_submitted',
        'Submitted reports can no longer be edited');
    }
    // Fail before modifying the Draft if its source data cannot be rendered.
    await this.view.get(principal, reportId, language);
    const client = await this.postgres.pool.connect();
    try {
      await client.query('BEGIN');
      const target = await client.query<ReportRow>(
        `SELECT r.id,r.status,f.id AS farm_uuid
         FROM reports r JOIN farms f ON f.id=r.farm_id
         WHERE r.public_id=$1 AND r.type='daily' AND f.company_id=$2
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

  private async save(client: PoolClient,
    report: ReportRow, input: DailyReportInput) {
    const referenced = new Set([
      ...(input.ponds ?? []).map((item) => item.pondId),
      ...(input.manualActions ?? []).map((item) => item.pondId).filter((id) => id !== null),
      ...(input.manualEquipmentEvents ?? []).map((item) => item.pondId)
        .filter((id) => id !== null),
    ] as string[]);
    const ponds = referenced.size
      ? await client.query<IdRow>(
        `SELECT id,public_id FROM ponds WHERE farm_id=$1 AND public_id=ANY($2::text[])`,
        [report.farm_uuid, [...referenced]],
      ) : { rows: [] as IdRow[] };
    const pondIds = new Map(ponds.rows.map((row) => [row.public_id, row.id]));
    for (const id of referenced) {
      if (!pondIds.has(id)) {
        throw new ApiProblem(422, 'validation_error', 'Invalid Daily Report input',
          { fieldErrors: [{ field: 'pondId', message: `Pond ${id} is not in this Farm` }] });
      }
    }
    for (const pond of input.ponds ?? []) {
      const columns = Object.keys(pond.values);
      if (!columns.length) continue;
      const values = columns.map((column) => pond.values[column]);
      await client.query(
        `INSERT INTO daily_report_pond_inputs (report_id,pond_id,${columns.join(',')})
         VALUES ($1,$2,${columns.map((_, index) => `$${index + 3}`).join(',')})
         ON CONFLICT (report_id,pond_id) DO UPDATE SET
           ${columns.map((column) => `${column}=EXCLUDED.${column}`).join(',')}`,
        [report.id, pondIds.get(pond.pondId), ...values],
      );
    }
    const environment: Record<string, string | number | null> = {
      ...(input.environment ?? {}),
      ...(input.summary !== undefined ? { summary: input.summary } : {}) };
    const columns = Object.keys(environment);
    if (columns.length) {
      await client.query(
        `INSERT INTO daily_report_inputs (report_id,${columns.join(',')})
         VALUES ($1,${columns.map((_, index) => `$${index + 2}`).join(',')})
         ON CONFLICT (report_id) DO UPDATE SET
           ${columns.map((column) => `${column}=EXCLUDED.${column}`).join(',')}`,
        [report.id, ...columns.map((column) => environment[column])],
      );
    }
    if (input.excludedAlertIds !== undefined) {
      const alerts = input.excludedAlertIds.length
        ? await client.query<IdRow>(
          `SELECT al.id,al.public_id FROM alerts al
           JOIN ponds p ON p.id=al.pond_id
           JOIN farms f ON f.id=p.farm_id
           JOIN reports r ON r.id=$3
           WHERE p.farm_id=$1 AND al.public_id=ANY($2::text[])
             AND al.occurred_at < (((r.report_date + 1) + time '00:00')
               AT TIME ZONE f.time_zone)
             AND (al.resolved_at IS NULL OR al.resolved_at >=
               ((r.report_date + time '00:00') AT TIME ZONE f.time_zone))`,
          [report.farm_uuid, input.excludedAlertIds, report.id],
        ) : { rows: [] as IdRow[] };
      if (alerts.rows.length !== input.excludedAlertIds.length) {
        throw new ApiProblem(422, 'validation_error', 'Invalid Daily Report input',
          { fieldErrors: [{ field: 'excludedAlertIds',
            message: 'Alert is not in this Farm' }] });
      }
      await client.query('DELETE FROM report_excluded_alerts WHERE report_id=$1', [report.id]);
      for (const alert of alerts.rows) {
        await client.query(`INSERT INTO report_excluded_alerts (report_id,alert_id)
          VALUES ($1,$2)`, [report.id, alert.id]);
      }
    }
    if (input.manualActions !== undefined) {
      await client.query('DELETE FROM report_manual_actions WHERE report_id=$1', [report.id]);
      for (const [index, action] of input.manualActions.entries()) {
        await client.query(`INSERT INTO report_manual_actions
          (public_id,report_id,pond_id,at,action,outcome,sort_order)
          VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [action.id ?? `man-${randomUUID()}`, report.id,
          action.pondId ? pondIds.get(action.pondId) : null,
          action.at, action.action, action.outcome, index]);
      }
    }
    if (input.manualEquipmentEvents !== undefined) {
      await client.query('DELETE FROM report_manual_equipment_events WHERE report_id=$1',
        [report.id]);
      for (const event of input.manualEquipmentEvents) {
        await client.query(`INSERT INTO report_manual_equipment_events
          (public_id,report_id,pond_id,equipment,failure,occurred_at,action,status)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [event.id ?? `eq-${randomUUID()}`, report.id,
          event.pondId ? pondIds.get(event.pondId) : null,
          event.equipment, event.failure, event.occurredAt, event.action, event.status]);
      }
    }
  }
}
