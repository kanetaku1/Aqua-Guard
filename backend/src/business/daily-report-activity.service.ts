import { Injectable } from '@nestjs/common';
import { PostgresService } from '../infrastructure/postgres.service';
import { displayTitle } from './alerts.service';
import { DailyReportEquipmentService } from './daily-report-equipment.service';

type Language = 'en' | 'id' | undefined;
interface DayRow { day_start: Date; day_end: Date }
interface AlertRow {
  public_id: string; pond_id: string; pond_name: string; parameter: string;
  device_parameter: string | null; severity: string; state: string;
  observed_value: string | null; threshold_value: string | null;
  unit: string | null; direction: 'below' | 'above' | null;
  occurred_at: Date; resolved_at: Date | null;
  acknowledged_id: string | null; acknowledged_name: string | null;
  handler_id: string | null; handler_name: string | null;
  excluded: boolean;
}
interface ActionRow {
  public_id: string; performed_at: Date; type: string; note: string | null;
  pond_id: string; pond_name: string;
}
interface ManualActionRow {
  public_id: string; at: Date; action: string; outcome: string | null;
  pond_id: string | null; pond_name: string | null; pond_farm_id: string | null;
}
interface EquipmentRow {
  public_id: string; equipment: string; failure: string; occurred_at: Date;
  action: string | null; status: 'in_progress' | 'resolved';
  pond_id: string | null; pond_name: string | null; pond_farm_id: string | null;
}

@Injectable()
export class DailyReportActivityService {
  constructor(
    private readonly postgres: PostgresService,
    private readonly equipment: DailyReportEquipmentService,
  ) {}

  async snapshot(reportUuid: string, farmUuid: string, date: string,
    timeZone: string, now = new Date(), language: Language = 'en') {
    const boundary = await this.postgres.pool.query<DayRow>(
      `SELECT (($1::date + time '00:00') AT TIME ZONE $2) AS day_start,
         ((($1::date + 1) + time '00:00') AT TIME ZONE $2) AS day_end`,
      [date, timeZone],
    );
    const { day_start: start, day_end: end } = boundary.rows[0];
    const [alerts, alertActions, manualActions, manualEquipment, actuatorEquipment] = await Promise.all([
      this.postgres.pool.query<AlertRow>(
        `SELECT al.public_id,p.public_id AS pond_id,p.name AS pond_name,
           al.parameter,d.parameter AS device_parameter,al.severity,al.state,
           al.observed_value,al.threshold_value,al.unit,al.direction,
           al.occurred_at,al.resolved_at,
           au.public_id AS acknowledged_id,au.name AS acknowledged_name,
           hu.public_id AS handler_id,hu.name AS handler_name,
           (excluded.alert_id IS NOT NULL) AS excluded
         FROM alerts al JOIN ponds p ON p.id=al.pond_id
         LEFT JOIN devices d ON d.id=al.device_id
         LEFT JOIN users au ON au.id=al.acknowledged_by
         LEFT JOIN LATERAL (
           SELECT aa.recorded_by FROM alert_actions aa WHERE aa.alert_id=al.id
           ORDER BY aa.created_at DESC,aa.id DESC LIMIT 1
         ) handler ON true
         LEFT JOIN users hu ON hu.id=handler.recorded_by
         LEFT JOIN report_excluded_alerts excluded
           ON excluded.alert_id=al.id AND excluded.report_id=$2
         WHERE p.farm_id=$1 AND al.occurred_at < $4
           AND (al.resolved_at IS NULL OR al.resolved_at >= $3)
         ORDER BY al.occurred_at,al.id`, [farmUuid, reportUuid, start, end],
      ),
      this.postgres.pool.query<ActionRow>(
        `SELECT aa.public_id,aa.performed_at,aa.type,aa.note,
           p.public_id AS pond_id,p.name AS pond_name
         FROM alert_actions aa JOIN alerts al ON al.id=aa.alert_id
         JOIN ponds p ON p.id=al.pond_id
         WHERE p.farm_id=$1 AND aa.performed_at >= $2 AND aa.performed_at < $3
         ORDER BY aa.performed_at,aa.id`, [farmUuid, start, end],
      ),
      this.postgres.pool.query<ManualActionRow>(
        `SELECT a.public_id,a.at,a.action,a.outcome,
           p.public_id AS pond_id,p.name AS pond_name,p.farm_id AS pond_farm_id
         FROM report_manual_actions a LEFT JOIN ponds p ON p.id=a.pond_id
         WHERE a.report_id=$1 ORDER BY a.at,a.sort_order,a.id`, [reportUuid],
      ),
      this.postgres.pool.query<EquipmentRow>(
        `SELECT e.public_id,e.equipment,e.failure,e.occurred_at,e.action,e.status,
           p.public_id AS pond_id,p.name AS pond_name,p.farm_id AS pond_farm_id
         FROM report_manual_equipment_events e LEFT JOIN ponds p ON p.id=e.pond_id
         WHERE e.report_id=$1 ORDER BY e.occurred_at,e.id`, [reportUuid],
      ),
      this.equipment.faultEvents(farmUuid, start, end, now),
    ]);
    if (manualActions.rows.some((row) => row.pond_farm_id !== null
      && row.pond_farm_id !== farmUuid)
      || manualEquipment.rows.some((row) => row.pond_farm_id !== null
        && row.pond_farm_id !== farmUuid)) {
      throw new Error('Daily Report references a Pond from another Farm');
    }
    const pond = (id: string | null, name: string | null) =>
      id && name ? { id, name } : null;
    const alertItems = alerts.rows.map((row) => {
      const through = Math.min(row.resolved_at?.getTime() ?? Infinity,
        end.getTime(), now.getTime());
      const handler = row.handler_id && row.handler_name
        ? { id: row.handler_id, name: row.handler_name }
        : row.acknowledged_id && row.acknowledged_name
          ? { id: row.acknowledged_id, name: row.acknowledged_name } : null;
      return {
        id: row.public_id, pond: { id: row.pond_id, name: row.pond_name },
        title: displayTitle(row, language), parameter: row.parameter,
        severity: row.severity, state: row.state,
        value: row.observed_value === null ? null : Number(row.observed_value),
        thresholdValue: row.threshold_value === null ? null : Number(row.threshold_value),
        unit: row.unit, direction: row.direction,
        occurredAt: row.occurred_at.toISOString(),
        resolvedAt: row.resolved_at?.toISOString() ?? null,
        handledBy: handler,
        durationMinutes: Math.max(0, Math.round((through - row.occurred_at.getTime()) / 60_000)),
        excluded: row.excluded,
      };
    });
    const actions = [
      ...alertActions.rows.map((row) => {
        const label = row.type.replace(/_/g, ' ');
        return { id: row.public_id, source: 'alert_handling',
          at: row.performed_at.toISOString(),
          pond: { id: row.pond_id, name: row.pond_name },
          action: `${label.charAt(0).toUpperCase()}${label.slice(1)}`
            + (row.note ? ` — ${row.note}` : ''), outcome: null };
      }),
      ...manualActions.rows.map((row) => ({
        id: row.public_id, source: 'manual', at: row.at.toISOString(),
        pond: pond(row.pond_id, row.pond_name),
        action: row.action, outcome: row.outcome,
      })),
    ].sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));
    return {
      alerts: alertItems,
      actions,
      equipmentEvents: [...actuatorEquipment, ...manualEquipment.rows.map((row) => ({
        id: row.public_id, source: 'manual', equipment: row.equipment,
        pond: pond(row.pond_id, row.pond_name), failure: row.failure,
        occurredAt: row.occurred_at.toISOString(), action: row.action,
        status: row.status,
      }))].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt)
        || a.id.localeCompare(b.id)),
    };
  }
}
