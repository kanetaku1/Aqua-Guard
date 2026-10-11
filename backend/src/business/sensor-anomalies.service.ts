import { Injectable } from '@nestjs/common';
import { Principal } from '../auth/auth.service';
import { ApiProblem } from '../http/problem';
import { PostgresService } from '../infrastructure/postgres.service';
import { BusinessScopeService } from './business-scope.service';

interface AnomalyRow {
  kind: 'below_threshold' | 'above_threshold' | 'increasing' | 'decreasing';
  parameter: string; severity: 'attention' | 'warning' | 'critical'; unit: string;
  started_at: Date; ended_at: Date | null; extreme_value: string | null;
  change_24h: string | null; compared_with: string | null;
  within_range: boolean; alert_id: string | null;
}

function invalid(field: string, message: string): never {
  throw new ApiProblem(422, 'validation_error', 'Invalid anomaly query', {
    fieldErrors: [{ field, message }],
  });
}
function instant(value: unknown, field: string): Date {
  if (typeof value !== 'string'
    || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.test(value)) {
    return invalid(field, 'Must be an ISO date-time');
  }
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return invalid(field, 'Invalid date-time');
  return parsed;
}

@Injectable()
export class SensorAnomaliesService {
  constructor(
    private readonly scope: BusinessScopeService,
    private readonly postgres: PostgresService,
  ) {}

  async list(principal: Principal, pondId: string, query: Record<string, unknown>) {
    if (principal.role !== 'technical_manager') {
      throw new ApiProblem(403, 'forbidden', 'Technical manager access required');
    }
    const pond = await this.scope.requirePond(principal, pondId);
    const to = query.to === undefined ? new Date() : instant(query.to, 'to');
    const from = query.from === undefined ? new Date(to.getTime() - 7 * 86400000)
      : instant(query.from, 'from');
    const span = to.getTime() - from.getTime();
    if (span <= 0 || span > 31 * 86400000) {
      return invalid('to', 'Range must be greater than zero and at most 31 days');
    }
    const result = await this.postgres.pool.query<AnomalyRow>(
      `SELECT a.kind, a.parameter, a.severity, a.unit, a.started_at, a.ended_at,
         a.extreme_value, a.change_24h,
         to_char(a.compared_with, 'YYYY-MM-DD') AS compared_with,
         a.within_range, al.public_id AS alert_id
       FROM sensor_anomaly_intervals a
       LEFT JOIN alerts al ON al.id = a.alert_id
       WHERE a.pond_id = $1 AND a.started_at < $3
         AND (a.ended_at IS NULL OR a.ended_at >= $2)
       ORDER BY a.started_at DESC, a.id DESC`,
      [pond.pondUuid, from, to],
    );
    return { items: result.rows.map((row) => ({
      kind: row.kind, parameter: row.parameter, severity: row.severity, unit: row.unit,
      startedAt: row.started_at.toISOString(), endedAt: row.ended_at?.toISOString() ?? null,
      extremeValue: row.extreme_value === null ? null : Number(row.extreme_value),
      change24h: row.change_24h === null ? null : Number(row.change_24h),
      comparedWith: row.compared_with, withinRange: row.within_range, alertId: row.alert_id,
    })) };
  }
}
