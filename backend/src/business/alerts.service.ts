import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { Principal } from '../auth/auth.service';
import { AdminDevicesService } from '../admin/admin-devices.service';
import { ApiProblem } from '../http/problem';
import { PostgresService } from '../infrastructure/postgres.service';
import { BusinessScopeService } from './business-scope.service';

type Language = 'en' | 'id' | undefined;
type State = 'unacknowledged' | 'acknowledged' | 'in_progress' | 'resolved';
const ACTION_TYPES = ['increased_aeration', 'water_exchange', 'equipment_inspection',
  'water_treatment', 'other'] as const;

interface AlertRow {
  id: string; public_id: string; pond_id: string; pond_public_id: string; pond_name: string;
  farm_id: string; farm_public_id: string; device_id: string | null;
  device_public_id: string | null; parameter: string; severity: string; state: State;
  observed_value: string | null; threshold_value: string | null; unit: string | null;
  direction: 'below' | 'above' | null; occurred_at: Date; resolved_at: Date | null;
  acknowledged_at: Date | null; acknowledged_user_id: string | null;
  acknowledged_user_name: string | null; handler_id: string | null; handler_name: string | null;
}

function invalid(field: string, message: string): never {
  throw new ApiProblem(422, 'validation_error', 'Invalid alert input', {
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

function instant(value: unknown, field: string): Date {
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.test(value)) {
    return invalid(field, 'Must be an ISO date-time');
  }
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return invalid(field, 'Invalid date-time');
  return parsed;
}

function optionalNote(value: unknown): string | null {
  if (value === undefined) return null;
  if (typeof value !== 'string' || value.length > 1000) {
    return invalid('note', 'Must be text of at most 1000 characters');
  }
  return value;
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return invalid('body', 'Must be an object');
  }
  return value as Record<string, unknown>;
}

function displayTitle(row: AlertRow, language: Language): string {
  const names: Record<string, [string, string]> = {
    do: ['DO', 'DO'], ph: ['pH', 'pH'], temperature: ['Temperature', 'Suhu'],
    tds: ['TDS', 'TDS'], turbidity: ['Turbidity', 'Kekeruhan'],
    water_level: ['Water level', 'Ketinggian air'],
    sensor_offline: ['Sensor offline', 'Sensor offline'],
  };
  const name = names[row.parameter]?.[language === 'id' ? 1 : 0] ?? row.parameter;
  if (row.observed_value === null || row.threshold_value === null || !row.direction) return name;
  const side = row.direction === 'below'
    ? (language === 'id' ? 'di bawah ambang' : 'below threshold')
    : (language === 'id' ? 'di atas ambang' : 'above threshold');
  const operator = row.direction === 'below' ? '<' : '>';
  const unit = row.unit ? ` ${row.unit}` : '';
  return `${name} ${side} (${Number(row.observed_value)}${unit} ${operator} ${Number(row.threshold_value)}${unit})`;
}

const COLUMNS = `al.id, al.public_id, al.pond_id, p.public_id AS pond_public_id,
  p.name AS pond_name, f.id AS farm_id, f.public_id AS farm_public_id,
  al.device_id, d.device_id AS device_public_id, al.parameter, al.severity,
  al.state, al.observed_value, al.threshold_value, al.unit, al.direction,
  al.occurred_at, al.resolved_at, al.acknowledged_at,
  au.public_id AS acknowledged_user_id, au.name AS acknowledged_user_name,
  hu.public_id AS handler_id, hu.name AS handler_name`;
const JOINS = `FROM alerts al JOIN ponds p ON p.id=al.pond_id
  JOIN farms f ON f.id=p.farm_id LEFT JOIN devices d ON d.id=al.device_id
  LEFT JOIN users au ON au.id=al.acknowledged_by
  LEFT JOIN LATERAL (
    SELECT aa.recorded_by FROM alert_actions aa WHERE aa.alert_id=al.id
    ORDER BY aa.created_at DESC, aa.id DESC LIMIT 1
  ) handler ON true LEFT JOIN users hu ON hu.id=handler.recorded_by`;

@Injectable()
export class AlertsService {
  constructor(
    private readonly postgres: PostgresService,
    private readonly scope: BusinessScopeService,
    private readonly devices: AdminDevicesService,
  ) {}

  private requireTm(principal: Principal): void {
    if (principal.role !== 'technical_manager') {
      throw new ApiProblem(403, 'forbidden', 'Technical manager access required');
    }
  }

  private project(row: AlertRow, language: Language) {
    const handler = row.handler_id && row.handler_name
      ? { id: row.handler_id, name: row.handler_name } : null;
    const acknowledged = row.acknowledged_user_id && row.acknowledged_user_name
      ? { id: row.acknowledged_user_id, name: row.acknowledged_user_name } : null;
    return {
      id: row.public_id, pond: { id: row.pond_public_id, name: row.pond_name },
      title: displayTitle(row, language), parameter: row.parameter, severity: row.severity,
      state: row.state, value: row.observed_value === null ? null : Number(row.observed_value),
      thresholdValue: row.threshold_value === null ? null : Number(row.threshold_value),
      unit: row.unit, direction: row.direction, occurredAt: row.occurred_at.toISOString(),
      resolvedAt: row.resolved_at?.toISOString() ?? null,
      handledBy: handler ?? acknowledged,
    };
  }

  private async row(principal: Principal, alertId: string): Promise<AlertRow> {
    this.requireTm(principal);
    const farms = await this.scope.visibleFarmIds(principal);
    const result = await this.postgres.pool.query<AlertRow>(
      `SELECT ${COLUMNS} ${JOINS}
       WHERE al.public_id=$1 AND f.company_id=$2 AND f.public_id=ANY($3)`,
      [alertId, principal.companyId, farms],
    );
    if (!result.rows[0]) throw new ApiProblem(404, 'not_found', 'Alert not found');
    return result.rows[0];
  }

  async list(principal: Principal, query: Record<string, unknown>, language: Language) {
    this.requireTm(principal);
    const farms = await this.scope.visibleFarmIds(principal);
    const farmId = query.farmId === undefined ? null : query.farmId;
    const pondId = query.pondId === undefined ? null : query.pondId;
    if (farmId !== null && (typeof farmId !== 'string' || !farmId)) invalid('farmId', 'Must be a Farm ID');
    if (pondId !== null && (typeof pondId !== 'string' || !pondId)) invalid('pondId', 'Must be a Pond ID');
    const rawStates = query.state === undefined ? [] : typeof query.state === 'string'
      ? query.state.split(',') : invalid('state', 'Must be comma-separated states');
    const allowed = ['open', 'unacknowledged', 'acknowledged', 'in_progress', 'resolved'];
    if (rawStates.some((state) => !allowed.includes(state))) invalid('state', 'Unsupported state');
    const states = rawStates.includes('open')
      ? [...new Set([...rawStates.filter((state) => state !== 'open'),
        'unacknowledged', 'acknowledged', 'in_progress'])] : rawStates;
    const from = query.from === undefined ? null : instant(query.from, 'from');
    const to = query.to === undefined ? null : instant(query.to, 'to');
    if (from && to && from > to) invalid('to', 'Must be on or after from');
    const page = positiveInteger(query.page, 'page', 1, 1000000);
    const pageSize = positiveInteger(query.pageSize, 'pageSize', 20, 100);
    const filter = `WHERE f.company_id=$1 AND f.public_id=ANY($2)
      AND ($3::text IS NULL OR f.public_id=$3)
      AND ($4::text IS NULL OR p.public_id=$4)
      AND (cardinality($5::text[])=0 OR al.state=ANY($5))
      AND ($6::timestamptz IS NULL OR al.occurred_at >= $6)
      AND ($7::timestamptz IS NULL OR al.occurred_at <= $7)`;
    const args = [principal.companyId, farms, farmId, pondId, states, from, to];
    const [count, rows] = await Promise.all([
      this.postgres.pool.query<{ total: string }>(
        `SELECT count(*)::text AS total FROM alerts al JOIN ponds p ON p.id=al.pond_id
         JOIN farms f ON f.id=p.farm_id ${filter}`, args),
      this.postgres.pool.query<AlertRow>(
        `SELECT ${COLUMNS} ${JOINS} ${filter}
         ORDER BY al.occurred_at DESC, al.id DESC LIMIT $8 OFFSET $9`,
        [...args, pageSize, (page - 1) * pageSize]),
    ]);
    return { page, pageSize, total: Number(count.rows[0].total),
      items: rows.rows.map((row) => this.project(row, language)) };
  }

  async get(principal: Principal, alertId: string, language: Language) {
    const row = await this.row(principal, alertId);
    const actions = await this.postgres.pool.query<{
      public_id: string; performed_at: Date; type: string; note: string | null;
      user_id: string; user_name: string;
    }>(
      `SELECT a.public_id, a.performed_at, a.type, a.note,
         u.public_id AS user_id, u.name AS user_name
       FROM alert_actions a JOIN users u ON u.id=a.recorded_by
       WHERE a.alert_id=$1 ORDER BY a.performed_at, a.created_at, a.id`, [row.id],
    );
    const online = row.device_public_id
      ? await this.devices.onlineDeviceIds(principal.companyId, row.farm_public_id) : null;
    return {
      ...this.project(row, language),
      acknowledgedAt: row.acknowledged_at?.toISOString() ?? null,
      acknowledgedBy: row.acknowledged_user_id && row.acknowledged_user_name
        ? { id: row.acknowledged_user_id, name: row.acknowledged_user_name } : null,
      sensor: row.device_public_id ? { deviceId: row.device_public_id,
        connection: online?.has(row.device_public_id) ? 'online' : 'offline' } : null,
      issueId: null,
      actions: actions.rows.map((action) => ({
        id: action.public_id, performedAt: action.performed_at.toISOString(),
        type: action.type, ...(action.note === null ? {} : { note: action.note }),
        recordedBy: { id: action.user_id, name: action.user_name },
        source: 'alert_handling',
      })),
    };
  }

  private async change(principal: Principal, alertId: string,
    action: (client: PoolClient, row: { id: string; state: State }) => Promise<void>): Promise<void> {
    this.requireTm(principal);
    const farms = await this.scope.visibleFarmIds(principal);
    const client = await this.postgres.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query<{ id: string; state: State }>(
        `SELECT al.id, al.state FROM alerts al JOIN ponds p ON p.id=al.pond_id
         JOIN farms f ON f.id=p.farm_id
         WHERE al.public_id=$1 AND f.company_id=$2 AND f.public_id=ANY($3)
         FOR UPDATE OF al`, [alertId, principal.companyId, farms],
      );
      if (!result.rows[0]) throw new ApiProblem(404, 'not_found', 'Alert not found');
      await action(client, result.rows[0]);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  private async history(client: PoolClient, id: string, from: State, to: State, user: string) {
    await client.query(
      `INSERT INTO alert_state_history (alert_id, from_state, to_state, changed_by)
       VALUES ($1,$2,$3,$4)`, [id, from, to, user],
    );
  }

  async acknowledge(principal: Principal, alertId: string, language: Language) {
    await this.change(principal, alertId, async (client, row) => {
      if (row.state !== 'unacknowledged') {
        throw new ApiProblem(409, 'invalid_state', 'Alert is not unacknowledged');
      }
      await client.query(
        `UPDATE alerts SET state='acknowledged', acknowledged_at=now(),
         acknowledged_by=$2 WHERE id=$1`, [row.id, principal.userId],
      );
      await this.history(client, row.id, row.state, 'acknowledged', principal.userId);
    });
    return this.get(principal, alertId, language);
  }

  async recordAction(principal: Principal, alertId: string, body: unknown, language: Language) {
    this.requireTm(principal);
    const input = object(body);
    const performedAt = instant(input.performedAt, 'performedAt');
    if (typeof input.type !== 'string' || !ACTION_TYPES.includes(input.type as typeof ACTION_TYPES[number])) {
      invalid('type', 'Unsupported action type');
    }
    const note = optionalNote(input.note);
    await this.change(principal, alertId, async (client, row) => {
      if (row.state === 'resolved') {
        throw new ApiProblem(409, 'invalid_state', 'Resolved alert cannot receive actions');
      }
      await client.query(
        `INSERT INTO alert_actions
         (public_id,alert_id,performed_at,type,note,recorded_by)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [`ACT-${randomUUID()}`, row.id, performedAt, input.type, note, principal.userId],
      );
      if (row.state !== 'in_progress') {
        await client.query(`UPDATE alerts SET state='in_progress' WHERE id=$1`, [row.id]);
        await this.history(client, row.id, row.state, 'in_progress', principal.userId);
      }
    });
    return this.get(principal, alertId, language);
  }

  async resolve(principal: Principal, alertId: string, body: unknown, language: Language) {
    this.requireTm(principal);
    const note = body === undefined ? null : optionalNote(object(body).note);
    await this.change(principal, alertId, async (client, row) => {
      if (row.state === 'resolved') {
        throw new ApiProblem(409, 'invalid_state', 'Alert is already resolved');
      }
      await client.query(
        `UPDATE alerts SET state='resolved', resolved_at=now(), resolve_note=$2
         WHERE id=$1`, [row.id, note],
      );
      await this.history(client, row.id, row.state, 'resolved', principal.userId);
    });
    return this.get(principal, alertId, language);
  }
}
