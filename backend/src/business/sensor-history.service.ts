import { Injectable } from '@nestjs/common';
import { Principal } from '../auth/auth.service';
import { AdminThresholdsService, Threshold } from '../admin/admin-thresholds.service';
import { ApiProblem } from '../http/problem';
import { InfluxService } from '../infrastructure/influx.service';
import { SensorParameter } from '../infrastructure/sensor-reading';
import { BusinessScopeService } from './business-scope.service';
import { severityFor } from './sensor-current.service';

const PARAMETERS: SensorParameter[] = ['do', 'ph', 'temperature', 'tds', 'turbidity', 'water_level'];
const FIVE_MINUTES = 300000;
interface RawRow { _time?: string; parameter?: string; value?: number; validity?: string }

function invalid(field: string, message: string): never {
  throw new ApiProblem(422, 'validation_error', 'Invalid sensor history query', {
    fieldErrors: [{ field, message }],
  });
}
function instant(raw: unknown, field: string): Date {
  if (typeof raw !== 'string'
    || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.test(raw)) {
    return invalid(field, 'Must be an ISO date-time');
  }
  const parsed = new Date(raw);
  if (!Number.isFinite(parsed.getTime())) return invalid(field, 'Invalid date-time');
  return parsed;
}
function pageNumber(raw: unknown, field: string, fallback: number, maximum: number): number {
  if (raw === undefined) return fallback;
  if (typeof raw !== 'string' || !/^\d+$/.test(raw)) {
    return invalid(field, `Must be an integer from 1 to ${maximum}`);
  }
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > maximum) {
    return invalid(field, `Must be an integer from 1 to ${maximum}`);
  }
  return parsed;
}

@Injectable()
export class SensorHistoryService {
  constructor(
    private readonly scope: BusinessScopeService,
    private readonly thresholds: AdminThresholdsService,
    private readonly influx: InfluxService,
  ) {}

  async get(principal: Principal, pondId: string, query: Record<string, unknown>) {
    if (principal.role !== 'technical_manager') {
      throw new ApiProblem(403, 'forbidden', 'Technical manager access required');
    }
    const pond = await this.scope.requirePond(principal, pondId);
    const to = query.to === undefined ? new Date() : instant(query.to, 'to');
    const from = query.from === undefined ? new Date(to.getTime() - 86400000)
      : instant(query.from, 'from');
    const span = to.getTime() - from.getTime();
    if (span <= 0 || span > 31 * 86400000) {
      return invalid('to', 'Range must be greater than zero and at most 31 days');
    }
    const page = pageNumber(query.page, 'page', 1, 1000000);
    const pageSize = pageNumber(query.pageSize, 'pageSize', 20, 100);
    let points: RawRow[];
    try {
      points = await this.influx.client.getQueryApi(this.influx.org).collectRows<RawRow>(
        `from(bucket: ${JSON.stringify(this.influx.bucket)})
         |> range(start: time(v: ${JSON.stringify(from.toISOString())}),
           stop: time(v: ${JSON.stringify(to.toISOString())}))
         |> filter(fn: (r) => r._measurement == "sensor_readings"
           and (r._field == "value" or r._field == "validity")
           and r.farm_id == ${JSON.stringify(pond.farmId)}
           and r.pond_id == ${JSON.stringify(pond.pondId)})
         |> pivot(rowKey: ["_time"], columnKey: ["_field"], valueColumn: "_value")
         |> filter(fn: (r) => r.validity == "valid")
         |> keep(columns: ["_time", "parameter", "value"])
         |> group(columns: [])
         |> limit(n: 200001)`,
      );
    } catch {
      throw new ApiProblem(503, 'storage_unavailable', 'Sensor data is unavailable');
    }
    if (points.length > 200000) {
      return invalid('from', 'Range contains too many readings');
    }
    const grouped = new Map<number, Map<SensorParameter, { at: number; value: number }>>();
    for (const point of points) {
      if (!point._time || !PARAMETERS.includes(point.parameter as SensorParameter)
        || typeof point.value !== 'number' || !Number.isFinite(point.value)) continue;
      const at = Date.parse(point._time);
      if (!Number.isFinite(at)) continue;
      const bucket = Math.floor(at / FIVE_MINUTES) * FIVE_MINUTES;
      let values = grouped.get(bucket);
      if (!values) { values = new Map(); grouped.set(bucket, values); }
      const parameter = point.parameter as SensorParameter;
      if (!values.has(parameter) || values.get(parameter)!.at < at) {
        values.set(parameter, { at, value: point.value });
      }
    }
    const times = [...grouped.keys()].sort((a, b) => b - a);
    const thresholdRows = await Promise.all(PARAMETERS.map((parameter) =>
      this.thresholds.effectiveThreshold(principal.companyId, pond.farmUuid, parameter)));
    const thresholdMap = new Map<SensorParameter, Threshold>(
      PARAMETERS.map((parameter, index) => [parameter, thresholdRows[index]]),
    );
    const items = times.slice((page - 1) * pageSize, page * pageSize).map((time) => {
      const values = grouped.get(time)!;
      return { measuredAt: new Date(time).toISOString(),
        values: Object.fromEntries(PARAMETERS.map((parameter) => {
          const value = values.get(parameter)?.value ?? null;
          return [parameter, { value, severity: value === null ? 'normal'
            : severityFor(value, thresholdMap.get(parameter)!) }];
        })) };
    });
    return { page, pageSize, total: times.length, items };
  }
}
