import { Injectable } from '@nestjs/common';
import { ApiProblem } from '../http/problem';
import { InfluxService } from '../infrastructure/influx.service';
import { PostgresService } from '../infrastructure/postgres.service';

type DeviceType = 'sensor' | 'aerator' | 'pump';
interface Device {
  device_id: string; type: DeviceType; parameter: string | null;
  pond_id: string; pond_name: string; assigned_at: Date;
}
interface LastRow {
  _time?: string; pond_id?: string; device_id?: string;
  _value?: unknown;
}
interface LastSeen { at: Date; value: unknown }

@Injectable()
export class FarmDeviceStatusService {
  constructor(
    private readonly postgres: PostgresService,
    private readonly influx: InfluxService,
  ) {}

  private async latest(farmId: string, measurement: string, field: string,
    onlyValid = false): Promise<Map<string, LastSeen>> {
    let rows: LastRow[];
    try {
      rows = await this.influx.client.getQueryApi(this.influx.org).collectRows<LastRow>(
      `from(bucket: ${JSON.stringify(this.influx.bucket)})
       |> range(start: 0)
       |> filter(fn: (r) => r._measurement == ${JSON.stringify(measurement)}
         and r.farm_id == ${JSON.stringify(farmId)}
         and r._field == ${JSON.stringify(field)}${onlyValid ? ' and r._value == "valid"' : ''})
       |> group(columns: ["pond_id", "device_id"]) |> last()`,
      );
    } catch {
      throw new ApiProblem(503, 'storage_unavailable', 'Device telemetry is unavailable');
    }
    const result = new Map<string, LastSeen>();
    for (const row of rows) {
      if (!row.pond_id || !row.device_id || !row._time) continue;
      const at = new Date(row._time);
      if (!Number.isFinite(at.getTime())) continue;
      result.set(`${row.pond_id}:${row.device_id}`, { at, value: row._value });
    }
    return result;
  }

  async snapshot(companyId: string, farmUuid: string, farmId: string, now = new Date()) {
    const [devices, rules, sensorLast, actuatorLast, heartbeatLast] = await Promise.all([
      this.postgres.pool.query<Device>(
        `SELECT d.device_id,d.type,d.parameter,p.public_id AS pond_id,
           p.name AS pond_name,a.assigned_at
         FROM devices d JOIN device_assignments a ON a.device_id=d.id
           AND a.unassigned_at IS NULL
         JOIN ponds p ON p.id=a.pond_id
         WHERE p.farm_id=$1 AND p.status='in_operation' AND d.enabled
         ORDER BY p.public_id,d.device_id`, [farmUuid],
      ),
      this.postgres.pool.query<{ sensor_offline_after_minutes: number }>(
        `SELECT sensor_offline_after_minutes FROM operational_rule_versions
         WHERE company_id=$1 AND effective_to IS NULL`, [companyId],
      ),
      this.latest(farmId, 'sensor_readings', 'validity', true),
      this.latest(farmId, 'actuator_feedback', 'state'),
      this.latest(farmId, 'device_heartbeats', 'online_hint'),
    ]);
    const offlineMs = (rules.rows[0]?.sensor_offline_after_minutes ?? 60) * 60_000;
    const sensors = { online: 0, total: 0,
      offline: [] as { deviceId: string; pond: { id: string; name: string };
        parameter: string; since: string }[], neverSeen: 0 };
    const aerators = { on: 0, total: 0, unknown: 0 };
    const pumps = { on: 0, total: 0, unknown: 0 };
    const equipmentFaults: string[] = [];
    const equipmentOffline: string[] = [];
    for (const device of devices.rows) {
      const key = `${device.pond_id}:${device.device_id}`;
      if (device.type === 'sensor') {
        const latest = sensorLast.get(key);
        const seen = latest && latest.at >= device.assigned_at && latest.at <= now ? latest : null;
        sensors.total += 1;
        if (!seen) {
          sensors.neverSeen += 1;
        } else if (now.getTime() - seen.at.getTime() <= offlineMs) {
          sensors.online += 1;
        } else {
          sensors.offline.push({ deviceId: device.device_id,
            pond: { id: device.pond_id, name: device.pond_name },
            parameter: device.parameter!,
            since: new Date(seen.at.getTime() + offlineMs).toISOString() });
        }
        continue;
      }
      const group = device.type === 'aerator' ? aerators : pumps;
      group.total += 1;
      const feedback = actuatorLast.get(key);
      const heartbeat = heartbeatLast.get(key);
      const validFeedback = feedback && feedback.at >= device.assigned_at
        && feedback.at <= now ? feedback : null;
      const validHeartbeat = heartbeat && heartbeat.at >= device.assigned_at
        && heartbeat.at <= now ? heartbeat : null;
      const connection = validHeartbeat && (!validFeedback || validHeartbeat.at > validFeedback.at)
        ? validHeartbeat : validFeedback;
      if (!connection) {
        group.unknown += 1;
      } else if (now.getTime() - connection.at.getTime() > offlineMs
        || (connection === validHeartbeat && connection.value === false)) {
        equipmentOffline.push(device.device_id);
      } else if (!validFeedback || now.getTime() - validFeedback.at.getTime() > offlineMs) {
        group.unknown += 1;
      } else if (validFeedback.value === 'fault') {
        equipmentFaults.push(device.device_id);
      } else if (validFeedback.value === 'on') {
        group.on += 1;
      }
    }
    return { sensors, aerators, pumps, equipmentFaults, equipmentOffline,
      // Report deadlines, generator and feeding plans are not wired into this snapshot yet.
      completeForFarmOperations: false };
  }
}
