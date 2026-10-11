import { Injectable } from '@nestjs/common';
import { Principal } from '../auth/auth.service';
import { AdminThresholdsService } from '../admin/admin-thresholds.service';
import { ApiProblem } from '../http/problem';
import { InfluxService } from '../infrastructure/influx.service';
import { SensorParameter } from '../infrastructure/sensor-reading';
import { BusinessScopeService } from './business-scope.service';

const PARAMETERS: SensorParameter[] = ['do', 'ph', 'temperature', 'tds', 'turbidity', 'water_level'];
const INTERVAL_MS = { '5m': 300000, '15m': 900000, '1h': 3600000,
  '6h': 21600000, '1d': 86400000 } as const;
type Interval = keyof typeof INTERVAL_MS;

function invalid(field: string, message: string): never {
  throw new ApiProblem(422, 'validation_error', 'Invalid sensor series query', {
    fieldErrors: [{ field, message }],
  });
}

function dateParam(value: unknown, field: string): Date {
  if (typeof value !== 'string'
    || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.test(value)) {
    return invalid(field, 'Must be an ISO date-time');
  }
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return invalid(field, 'Invalid date-time');
  return date;
}

function intervalFor(spanMs: number): Interval {
  if (spanMs <= 86400000) return '5m';
  if (spanMs <= 3 * 86400000) return '15m';
  if (spanMs <= 7 * 86400000) return '1h';
  if (spanMs <= 30 * 86400000) return '6h';
  return '1d';
}

@Injectable()
export class SensorSeriesService {
  constructor(
    private readonly scope: BusinessScopeService,
    private readonly thresholds: AdminThresholdsService,
    private readonly influx: InfluxService,
  ) {}

  async get(principal: Principal, pondId: string, query: Record<string, unknown>) {
    const pond = await this.scope.requirePond(principal, pondId);
    if (typeof query.parameter !== 'string'
      || !PARAMETERS.includes(query.parameter as SensorParameter)) {
      return invalid('parameter', 'Unsupported sensor parameter');
    }
    const parameter = query.parameter as SensorParameter;
    const from = dateParam(query.from, 'from');
    const to = dateParam(query.to, 'to');
    if (to <= from) return invalid('to', 'Must be later than from');
    const interval: Interval = query.interval === undefined
      ? intervalFor(to.getTime() - from.getTime())
      : typeof query.interval === 'string' && Object.hasOwn(INTERVAL_MS, query.interval)
        ? query.interval as Interval : invalid('interval', 'Unsupported interval');
    const step = INTERVAL_MS[interval];
    if (Math.ceil((to.getTime() - from.getTime()) / step) > 10000) {
      return invalid('interval', 'The selected interval produces too many points');
    }
    const threshold = await this.thresholds.effectiveThreshold(
      principal.companyId, pond.farmUuid, parameter,
    );
    let rows: { _time?: string; _value?: number }[];
    try {
      rows = await this.influx.client.getQueryApi(this.influx.org).collectRows<{
        _time?: string; _value?: number;
      }>(
        `from(bucket: ${JSON.stringify(this.influx.bucket)})
         |> range(start: time(v: ${JSON.stringify(from.toISOString())}),
           stop: time(v: ${JSON.stringify(to.toISOString())}))
         |> filter(fn: (r) => r._measurement == "sensor_readings" and r._field == "value"
           and r.farm_id == ${JSON.stringify(pond.farmId)}
           and r.pond_id == ${JSON.stringify(pond.pondId)}
           and r.parameter == ${JSON.stringify(parameter)})
         |> keep(columns: ["_time", "_value"])`,
      );
    } catch {
      throw new ApiProblem(503, 'storage_unavailable', 'Sensor data is unavailable');
    }
    const buckets = new Map<number, { sum: number; count: number; min: number; max: number }>();
    for (const row of rows) {
      const time = row._time ? Date.parse(row._time) : NaN;
      const value = row._value;
      if (!Number.isFinite(time) || typeof value !== 'number' || !Number.isFinite(value)) continue;
      const at = Math.ceil(time / step) * step;
      const current = buckets.get(at);
      if (current) {
        current.sum += value; current.count += 1;
        current.min = Math.min(current.min, value); current.max = Math.max(current.max, value);
      } else buckets.set(at, { sum: value, count: 1, min: value, max: value });
    }
    const points: { t: string; avg: number | null; min: number | null; max: number | null }[] = [];
    for (let at = Math.ceil(from.getTime() / step) * step; at <= to.getTime(); at += step) {
      const bucket = buckets.get(at);
      points.push({ t: new Date(at).toISOString(), avg: bucket ? bucket.sum / bucket.count : null,
        min: bucket?.min ?? null, max: bucket?.max ?? null });
    }
    return { parameter, unit: threshold.unit, interval, points, threshold };
  }
}
