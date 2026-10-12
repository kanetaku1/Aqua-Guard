import { Injectable } from '@nestjs/common';
import { Principal } from '../auth/auth.service';
import { ApiProblem } from '../http/problem';
import { PostgresService } from '../infrastructure/postgres.service';
import { BusinessScopeService } from './business-scope.service';

type Language = 'en' | 'id' | undefined;
interface IssueRow {
  id: string; public_id: string; farm_public_id: string; farm_name: string;
  pond_public_id: string; pond_name: string; issue_type: string; parameter: string;
  trend: string; severity: string; handling: string; state: string;
  since: Date; resolved_at: Date | null; alert_id: string;
  acknowledged_user_id: string | null; acknowledged_user_name: string | null;
  handler_id: string | null; handler_name: string | null;
  sensor_parameter: string | null;
}

function invalid(field: string, message: string): never {
  throw new ApiProblem(422, 'validation_error', 'Invalid issue query', {
    fieldErrors: [{ field, message }],
  });
}
function positiveInteger(value: unknown, field: string, fallback: number, maximum: number): number {
  if (value === undefined) return fallback;
  const parsed = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : NaN;
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > maximum) {
    return invalid(field, `Must be an integer from 1 to ${maximum}`);
  }
  return parsed;
}

const COLUMNS = `i.id, i.public_id, f.public_id AS farm_public_id,
  f.name AS farm_name, p.public_id AS pond_public_id, p.name AS pond_name,
  i.issue_type, i.parameter, i.trend, i.severity, a.state AS handling,
  i.state, i.since, i.resolved_at, a.id AS alert_id,
  au.public_id AS acknowledged_user_id, au.name AS acknowledged_user_name,
  hu.public_id AS handler_id, hu.name AS handler_name,
  d.parameter AS sensor_parameter`;
const JOINS = `FROM issues i JOIN farms f ON f.id=i.farm_id
  JOIN ponds p ON p.id=i.pond_id
  JOIN alerts a ON i.source_type='alert' AND a.id=i.source_id
  LEFT JOIN devices d ON d.id=a.device_id
  LEFT JOIN users au ON au.id=a.acknowledged_by
  LEFT JOIN LATERAL (
    SELECT aa.recorded_by FROM alert_actions aa WHERE aa.alert_id=a.id
    ORDER BY aa.created_at DESC, aa.id DESC LIMIT 1
  ) handler ON true LEFT JOIN users hu ON hu.id=handler.recorded_by`;

function name(parameter: string, language: Language): string {
  const names: Record<string, [string, string]> = {
    do: ['DO', 'DO'], ph: ['pH', 'pH'], temperature: ['Temperature', 'Suhu'],
    tds: ['TDS', 'TDS'], turbidity: ['Turbidity', 'Kekeruhan'],
    water_level: ['Water level', 'Ketinggian air'],
    sensor_offline: ['Sensor', 'Sensor'],
  };
  return names[parameter]?.[language === 'id' ? 1 : 0] ?? parameter;
}

@Injectable()
export class IssuesService {
  constructor(
    private readonly postgres: PostgresService,
    private readonly scope: BusinessScopeService,
  ) {}

  private requireFm(principal: Principal): void {
    if (principal.role !== 'farms_manager') {
      throw new ApiProblem(403, 'forbidden', 'Farms manager access required');
    }
  }

  private project(row: IssueRow) {
    return {
      id: row.public_id, farm: { id: row.farm_public_id, name: row.farm_name },
      pond: { id: row.pond_public_id, name: row.pond_name },
      issueType: row.issue_type, parameter: row.parameter, trend: row.trend,
      severity: row.severity, handling: row.handling, state: row.state,
      since: row.since.toISOString(), resolvedAt: row.resolved_at?.toISOString() ?? null,
    };
  }

  private async row(principal: Principal, issueId: string): Promise<IssueRow> {
    this.requireFm(principal);
    const farms = await this.scope.visibleFarmIds(principal);
    const result = await this.postgres.pool.query<IssueRow>(
      `SELECT ${COLUMNS} ${JOINS}
       WHERE i.public_id=$1 AND f.company_id=$2 AND f.public_id=ANY($3)`,
      [issueId, principal.companyId, farms],
    );
    if (!result.rows[0]) throw new ApiProblem(404, 'not_found', 'Issue not found');
    return result.rows[0];
  }

  async list(principal: Principal, query: Record<string, unknown>, _language: Language) {
    this.requireFm(principal);
    const farms = await this.scope.visibleFarmIds(principal);
    const farmId = query.farmId === undefined ? null : query.farmId;
    if (farmId !== null && (typeof farmId !== 'string' || !farmId)) {
      invalid('farmId', 'Must be a Farm ID');
    }
    const state = query.state === undefined ? 'ongoing' : query.state;
    if (state !== 'ongoing' && state !== 'resolved') invalid('state', 'Unsupported state');
    const page = positiveInteger(query.page, 'page', 1, 1000000);
    const pageSize = positiveInteger(query.pageSize, 'pageSize', 20, 100);
    const filter = `WHERE f.company_id=$1 AND f.public_id=ANY($2)
      AND ($3::text IS NULL OR f.public_id=$3) AND i.state=$4`;
    const args = [principal.companyId, farms, farmId, state];
    const [count, rows] = await Promise.all([
      this.postgres.pool.query<{ total: string }>(
        `SELECT count(*)::text AS total ${JOINS} ${filter}`, args),
      this.postgres.pool.query<IssueRow>(
        `SELECT ${COLUMNS} ${JOINS} ${filter}
         ORDER BY CASE i.severity WHEN 'critical' THEN 3 WHEN 'warning' THEN 2 ELSE 1 END DESC,
           i.since ASC, i.id ASC LIMIT $5 OFFSET $6`,
        [...args, pageSize, (page - 1) * pageSize]),
    ]);
    return { page, pageSize, total: Number(count.rows[0].total),
      items: rows.rows.map((row) => this.project(row)) };
  }

  async get(principal: Principal, issueId: string, language: Language) {
    const row = await this.row(principal, issueId);
    const [actions, reports] = await Promise.all([
      this.postgres.pool.query<{
      public_id: string; performed_at: Date; type: string; note: string | null;
      user_id: string; user_name: string;
      }>(
      `SELECT aa.public_id, aa.performed_at, aa.type, aa.note,
         u.public_id AS user_id, u.name AS user_name
       FROM alert_actions aa JOIN users u ON u.id=aa.recorded_by
       WHERE aa.alert_id=$1 ORDER BY aa.performed_at,aa.created_at,aa.id`,
      [row.alert_id],
      ),
      this.postgres.pool.query<{
        public_id: string; type: 'daily' | 'weekly';
        report_date: string | null; week_start: string | null;
      }>(
        `SELECT r.public_id,r.type,
           to_char(r.report_date,'YYYY-MM-DD') AS report_date,
           to_char(r.week_start,'YYYY-MM-DD') AS week_start
         FROM reports r JOIN farms f ON f.id=r.farm_id
         JOIN report_snapshots s ON s.report_id=r.id
         JOIN alerts a ON a.id=$1
         WHERE f.public_id=$2 AND f.company_id=$3 AND r.status='submitted'
           AND s.payload->'alerts' @>
             jsonb_build_array(jsonb_build_object('id',a.public_id))
         ORDER BY r.submitted_at DESC,r.id DESC`,
        [row.alert_id, row.farm_public_id, principal.companyId],
      ),
    ]);
    const subject = name(row.parameter === 'sensor_offline'
      ? row.sensor_parameter ?? row.parameter : row.parameter, language);
    const isLow = row.trend === 'decreasing';
    const summary = row.parameter === 'sensor_offline'
      ? (language === 'id' ? `Sensor ${subject} offline di ${row.pond_name}`
        : `${subject} sensor offline in ${row.pond_name}`)
      : language === 'id'
      ? `${subject} ${isLow ? 'rendah' : 'tinggi'} di ${row.pond_name}`
      : `${isLow ? 'Low' : 'High'} ${subject} in ${row.pond_name}`;
    const trendDescription = row.parameter === 'sensor_offline'
      ? (language === 'id' ? 'Tidak ada data sensor terbaru.'
        : 'No recent sensor data is available.')
      : language === 'id'
      ? `${subject} ${isLow ? 'turun di bawah' : 'naik di atas'} ambang batas.`
      : `${subject} ${isLow ? 'fell below' : 'rose above'} the configured threshold.`;
    const handledBy = row.handler_id && row.handler_name
      ? { id: row.handler_id, name: row.handler_name }
      : row.acknowledged_user_id && row.acknowledged_user_name
        ? { id: row.acknowledged_user_id, name: row.acknowledged_user_name } : null;
    return {
      ...this.project(row), summary, trendDescription, handledBy,
      actions: actions.rows.map((action) => ({
        id: action.public_id, performedAt: action.performed_at.toISOString(),
        type: action.type, ...(action.note === null ? {} : { note: action.note }),
        recordedBy: { id: action.user_id, name: action.user_name },
        source: 'alert_handling',
      })),
      relatedReports: reports.rows.map((report) => ({
        id: report.public_id, type: report.type,
        label: report.type === 'daily' ? `Daily ${report.report_date}`
          : `Weekly ${report.week_start}`,
        ...(report.type === 'daily' ? { date: report.report_date }
          : { weekStart: report.week_start }),
      })),
    };
  }
}
