import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { Principal } from '../auth/auth.service';
import { ApiProblem } from '../http/problem';
import { InfluxService } from '../infrastructure/influx.service';
import { PostgresService } from '../infrastructure/postgres.service';
import { BusinessScopeService } from './business-scope.service';

type Command = 'turn_on' | 'turn_off' | 'set_manual' | 'set_auto';
const COMMANDS: Command[] = ['turn_on', 'turn_off', 'set_manual', 'set_auto'];
interface DeviceRow {
  id: string; device_id: string; type: 'aerator' | 'pump'; spec: string | null;
  assigned_at: Date; desired_mode: 'auto' | 'manual' | null;
  auto_rule_label: string | null; emergency_latched: boolean | null;
  command_enabled: boolean | null; safety_description: string | null;
}
interface FeedbackRow {
  _time?: string; device_id?: string; pond_id?: string;
  state?: string; mode?: string;
}
interface HeartbeatRow {
  _time?: string; device_id?: string; pond_id?: string;
  _value?: boolean;
}
interface LogRow {
  public_id: string; device_id: string; type: string; command: string;
  at: Date; actor_id: string | null; actor_name: string | null;
  mode: string; result: string;
}

@Injectable()
export class ActuatorsService {
  constructor(
    private readonly postgres: PostgresService,
    private readonly influx: InfluxService,
    private readonly scope: BusinessScopeService,
  ) {}

  private async devices(pondUuid: string): Promise<DeviceRow[]> {
    return (await this.postgres.pool.query<DeviceRow>(
      `SELECT d.id,d.device_id,d.type,d.spec,a.assigned_at,
         c.desired_mode,c.auto_rule_label,c.emergency_latched,
         c.command_enabled,c.safety_description
       FROM devices d JOIN device_assignments a ON a.device_id=d.id
         AND a.unassigned_at IS NULL
       LEFT JOIN actuator_control_configs c ON c.device_id=d.id
       WHERE a.pond_id=$1 AND d.enabled AND d.type IN ('aerator','pump')
       ORDER BY d.type,d.device_id`, [pondUuid])).rows;
  }

  private async telemetry(farmId: string, pondId: string) {
    const prefix = `from(bucket: ${JSON.stringify(this.influx.bucket)})
      |> range(start: 0)
      |> filter(fn: (r) => r.farm_id == ${JSON.stringify(farmId)}
        and r.pond_id == ${JSON.stringify(pondId)})`;
    try {
      const [feedback, beats] = await Promise.all([
        this.influx.client.getQueryApi(this.influx.org).collectRows<FeedbackRow>(
          `${prefix}
           |> filter(fn: (r) => r._measurement == "actuator_feedback"
             and (r._field == "state" or r._field == "mode"))
           |> pivot(rowKey: ["_time","pond_id","device_id"],
             columnKey: ["_field"], valueColumn: "_value")
           |> group(columns: ["pond_id","device_id"])
           |> sort(columns: ["_time"], desc: true) |> first()`),
        this.influx.client.getQueryApi(this.influx.org).collectRows<HeartbeatRow>(
          `${prefix}
           |> filter(fn: (r) => r._measurement == "device_heartbeats"
             and r._field == "online_hint")
           |> group(columns: ["pond_id","device_id"]) |> last()`),
      ]);
      return { feedback: new Map(feedback.filter((row) => row.device_id)
        .map((row) => [row.device_id!, row])),
      beats: new Map(beats.filter((row) => row.device_id)
        .map((row) => [row.device_id!, row])) };
    } catch {
      throw new ApiProblem(503, 'storage_unavailable',
        'Actuator telemetry is unavailable');
    }
  }

  async list(principal: Principal, pondId: string, now = new Date()) {
    if (principal.role !== 'technical_manager') {
      throw new ApiProblem(403, 'forbidden', 'Technical manager access required');
    }
    const pond = await this.scope.requirePond(principal, pondId);
    const [devices, rules] = await Promise.all([
      this.devices(pond.pondUuid),
      this.postgres.pool.query<{ sensor_offline_after_minutes: number }>(
        `SELECT sensor_offline_after_minutes FROM operational_rule_versions
         WHERE company_id=$1 AND effective_to IS NULL`, [principal.companyId]),
    ]);
    const { feedback, beats } = devices.length
      ? await this.telemetry(pond.farmId, pondId)
      : { feedback: new Map<string, FeedbackRow>(),
        beats: new Map<string, HeartbeatRow>() };
    const timeoutMs = (rules.rows[0]?.sensor_offline_after_minutes ?? 60) * 60_000;
    let aerator = 0;
    let pump = 0;
    const items = devices.map((device) => {
      const name = device.type === 'aerator'
        ? `Aerator ${++aerator}` : `Water Pump ${++pump}`;
      const state = feedback.get(device.device_id);
      const beat = beats.get(device.device_id);
      const stateAt = Date.parse(state?._time ?? '');
      const beatAt = Date.parse(beat?._time ?? '');
      const validState = Number.isFinite(stateAt)
        && stateAt >= device.assigned_at.getTime() && stateAt <= now.getTime()
        && ['on', 'off', 'fault'].includes(state?.state ?? '')
        && ['auto', 'manual'].includes(state?.mode ?? '');
      if (!validState) {
        throw new ApiProblem(503, 'actuator_state_not_ready',
          `Observed state or mode is missing for ${device.device_id}`);
      }
      const connectionAt = Math.max(stateAt, Number.isFinite(beatAt) ? beatAt : -Infinity);
      const connection = now.getTime() - connectionAt <= timeoutMs
        && !(beatAt >= stateAt && beat?._value === false) ? 'online' : 'offline';
      const reasons: string[] = [];
      if (connection === 'offline') reasons.push('Device is offline');
      if (state?.state === 'fault') reasons.push('Device reported a fault');
      if (device.emergency_latched) reasons.push('Emergency stop is latched');
      if (!device.command_enabled) reasons.push('Safety policy is not commissioned');
      // A configured policy alone does not authorize live equipment commands:
      // the on-wire protocol and ACK contract must be verified first.
      reasons.push('Equipment command protocol is not verified');
      return {
        id: device.device_id, type: device.type, name,
        state: state!.state, mode: state!.mode, connection,
        autoRule: device.auto_rule_label, spec: device.spec,
        runtimeTodayH: null, modeSince: null, lastRunAt: null,
        safety: [{ label: 'Safety', value: device.safety_description
          ?? 'Equipment controls are not commissioned' }],
        blockedCommands: COMMANDS.map((command) => ({
          command, reason: reasons.join('; '),
        })),
        updatedAt: new Date(stateAt).toISOString(),
      };
    });
    return { items, autoControl: {
      status: devices.some((device) => device.emergency_latched) ? 'paused'
        : 'stopped',
      target: devices.map((device) => device.auto_rule_label).filter(Boolean)
        .join('; ') || 'Not configured',
      overrides: items.filter((item) => item.mode === 'manual'
        && devices.find((device) => device.device_id === item.id)
          ?.desired_mode === 'auto').length,
      scope: items.map((item) => item.name).join(', ') || 'No actuators',
    } };
  }

  async command(principal: Principal, actuatorId: string, body: unknown) {
    if (principal.role !== 'technical_manager') {
      throw new ApiProblem(403, 'forbidden', 'Technical manager access required');
    }
    const command = body && typeof body === 'object' && !Array.isArray(body)
      ? (body as Record<string, unknown>).command : undefined;
    if (!COMMANDS.includes(command as Command)) {
      throw new ApiProblem(422, 'validation_error', 'Invalid Actuator command',
        { fieldErrors: [{ field: 'command', message: 'Unsupported command' }] });
    }
    const visible = await this.scope.visibleFarmIds(principal);
    const target = await this.postgres.pool.query<{
      id: string; device_id: string; pond_id: string;
    }>(
      `SELECT d.id,d.device_id,p.id AS pond_id FROM devices d
       JOIN device_assignments a ON a.device_id=d.id AND a.unassigned_at IS NULL
       JOIN ponds p ON p.id=a.pond_id JOIN farms f ON f.id=p.farm_id
       WHERE d.device_id=$1 AND d.enabled AND d.type IN ('aerator','pump')
         AND f.company_id=$2 AND f.public_id=ANY($3)`,
      [actuatorId, principal.companyId, visible],
    );
    if (!target.rows[0]) throw new ApiProblem(404, 'not_found', 'Actuator not found');
    const reason = 'Equipment command protocol and site safety policy are not commissioned';
    const client = await this.postgres.pool.connect();
    try {
      await client.query('BEGIN');
      const saved = await client.query<{ id: string }>(
        `INSERT INTO actuator_commands
           (public_id,device_id,pond_id,requested_by,source,command,status,
            safety_result,safety_reason)
         VALUES ($1,$2,$3,$4,'manual',$5,'blocked','blocked',$6)
         RETURNING id`,
        [`cmd-${randomUUID()}`, target.rows[0].id, target.rows[0].pond_id,
          principal.userId, command, reason],
      );
      await client.query(
        `INSERT INTO actuator_logs
           (public_id,command_id,device_id,pond_id,command,actor_id,mode,
            result,reason)
         VALUES ($1,$2,$3,$4,$5,$6,'manual','blocked',$7)`,
        [`log-${randomUUID()}`, saved.rows[0].id, target.rows[0].id,
          target.rows[0].pond_id, command, principal.userId, reason],
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    throw new ApiProblem(409, 'safety_blocked',
      reason, { detail: reason });
  }

  async logs(principal: Principal, pondId: string,
    query: Record<string, unknown>) {
    if (principal.role !== 'technical_manager') {
      throw new ApiProblem(403, 'forbidden', 'Technical manager access required');
    }
    const pond = await this.scope.requirePond(principal, pondId);
    const page = query.page === undefined ? 1 : Number(query.page);
    const pageSize = query.pageSize === undefined ? 20 : Number(query.pageSize);
    if (!Number.isInteger(page) || page < 1 || !Number.isInteger(pageSize)
      || pageSize < 1 || pageSize > 100) {
      throw new ApiProblem(422, 'validation_error', 'Invalid pagination');
    }
    const [count, rows] = await Promise.all([
      this.postgres.pool.query<{ total: string }>(
        `SELECT count(*)::text AS total FROM actuator_logs WHERE pond_id=$1`,
        [pond.pondUuid]),
      this.postgres.pool.query<LogRow>(
        `SELECT l.public_id,d.device_id,d.type,l.command,l.at,
           u.public_id AS actor_id,u.name AS actor_name,l.mode,l.result
         FROM actuator_logs l JOIN devices d ON d.id=l.device_id
         LEFT JOIN users u ON u.id=l.actor_id
         WHERE l.pond_id=$1 ORDER BY l.at DESC,l.id DESC
         LIMIT $2 OFFSET $3`,
        [pond.pondUuid, pageSize, (page - 1) * pageSize]),
    ]);
    const total = Number(count.rows[0]?.total ?? 0);
    return { items: rows.rows.map((row) => ({
      id: row.public_id, actuatorId: row.device_id,
      actuatorName: row.device_id, command: row.command,
      at: row.at.toISOString(),
      by: row.actor_id && row.actor_name
        ? { id: row.actor_id, name: row.actor_name } : null,
      mode: row.mode, result: row.result,
    })), page, pageSize, total, totalPages: Math.ceil(total / pageSize) };
  }
}
