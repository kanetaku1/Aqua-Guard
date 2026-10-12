import { Injectable } from '@nestjs/common';
import { PostgresService } from '../infrastructure/postgres.service';
import { displayTitle } from './alerts.service';

type Language = 'en' | 'id' | undefined;
interface Boundary { start_at: Date; end_at: Date }
interface AlertRow {
  public_id: string; pond_id: string; pond_name: string;
  parameter: string; device_parameter: string | null;
  severity: string; state: string; observed_value: string | null;
  threshold_value: string | null; unit: string | null;
  direction: 'below' | 'above' | null;
  occurred_at: Date; resolved_at: Date | null;
  acknowledged_id: string | null; acknowledged_name: string | null;
  handler_id: string | null; handler_name: string | null;
  cause: string | null; action: string | null; outcome: string | null;
}
interface ActionRow {
  public_id: string; action_date: string; action: string;
  pond_id: string | null; pond_name: string | null;
  pond_farm_id: string | null;
}

function nextWeek(start: string): string {
  return new Date(Date.parse(`${start}T00:00:00Z`) + 7 * 86_400_000)
    .toISOString().slice(0, 10);
}

@Injectable()
export class WeeklyReportActivityService {
  constructor(private readonly postgres: PostgresService) {}

  async snapshot(reportUuid: string, farmUuid: string, weekStart: string,
    timeZone: string, now = new Date(), language: Language = 'en') {
    const boundary = await this.postgres.pool.query<Boundary>(
      `SELECT (($1::date + time '00:00') AT TIME ZONE $3) AS start_at,
         (($2::date + time '00:00') AT TIME ZONE $3) AS end_at`,
      [weekStart, nextWeek(weekStart), timeZone],
    );
    const { start_at: start, end_at: end } = boundary.rows[0];
    const [alerts, actions] = await Promise.all([
      this.postgres.pool.query<AlertRow>(
        `SELECT al.public_id,p.public_id AS pond_id,p.name AS pond_name,
           al.parameter,d.parameter AS device_parameter,al.severity,al.state,
           al.observed_value,al.threshold_value,al.unit,al.direction,
           al.occurred_at,al.resolved_at,
           au.public_id AS acknowledged_id,au.name AS acknowledged_name,
           hu.public_id AS handler_id,hu.name AS handler_name,
           notes.cause,notes.action,notes.outcome
         FROM alerts al JOIN ponds p ON p.id=al.pond_id
         LEFT JOIN devices d ON d.id=al.device_id
         LEFT JOIN users au ON au.id=al.acknowledged_by
         LEFT JOIN LATERAL (
           SELECT aa.recorded_by FROM alert_actions aa WHERE aa.alert_id=al.id
           ORDER BY aa.created_at DESC,aa.id DESC LIMIT 1
         ) handler ON true LEFT JOIN users hu ON hu.id=handler.recorded_by
         LEFT JOIN weekly_report_alert_notes notes
           ON notes.alert_id=al.id AND notes.report_id=$2
         WHERE p.farm_id=$1 AND al.occurred_at<$4
           AND (al.resolved_at IS NULL OR al.resolved_at>=$3)
         ORDER BY al.occurred_at,al.id`, [farmUuid, reportUuid, start, end],
      ),
      this.postgres.pool.query<ActionRow>(
        `SELECT a.public_id,to_char(a.action_date,'YYYY-MM-DD') AS action_date,
           a.action,p.public_id AS pond_id,p.name AS pond_name,
           p.farm_id AS pond_farm_id
         FROM weekly_report_major_actions a
         LEFT JOIN ponds p ON p.id=a.pond_id
         WHERE a.report_id=$1 ORDER BY a.sort_order,a.id`, [reportUuid],
      ),
    ]);
    if (actions.rows.some((row) => row.pond_farm_id !== null
      && row.pond_farm_id !== farmUuid)) {
      throw new Error('Weekly Report references a Pond from another Farm');
    }
    return {
      alerts: alerts.rows.map((row) => {
        const through = Math.min(row.resolved_at?.getTime() ?? Infinity,
          end.getTime(), now.getTime());
        const handledBy = row.handler_id && row.handler_name
          ? { id: row.handler_id, name: row.handler_name }
          : row.acknowledged_id && row.acknowledged_name
            ? { id: row.acknowledged_id, name: row.acknowledged_name } : null;
        return {
          id: row.public_id, pond: { id: row.pond_id, name: row.pond_name },
          title: displayTitle(row, language), parameter: row.parameter,
          severity: row.severity, state: row.state,
          value: row.observed_value === null ? null : Number(row.observed_value),
          thresholdValue: row.threshold_value === null ? null
            : Number(row.threshold_value),
          unit: row.unit, direction: row.direction,
          occurredAt: row.occurred_at.toISOString(),
          resolvedAt: row.resolved_at?.toISOString() ?? null,
          handledBy,
          durationMinutes: Math.max(0,
            Math.round((through - row.occurred_at.getTime()) / 60_000)),
          cause: row.cause, action: row.action, outcome: row.outcome,
        };
      }),
      majorActions: actions.rows.map((row) => ({
        id: row.public_id, date: row.action_date,
        pond: row.pond_id && row.pond_name
          ? { id: row.pond_id, name: row.pond_name } : null,
        action: row.action,
      })),
    };
  }
}
