import { Injectable } from '@nestjs/common';
import { AdminThresholdsService, Threshold } from '../admin/admin-thresholds.service';
import { ApiProblem } from '../http/problem';
import { InfluxService } from '../infrastructure/influx.service';
import { PostgresService } from '../infrastructure/postgres.service';
import { severityFor } from './sensor-current.service';

type Parameter = 'do' | 'ph' | 'temperature';
type Severity = 'normal' | 'attention' | 'warning' | 'critical';
const PARAMETERS: Parameter[] = ['do', 'ph', 'temperature'];
const RANK: Record<Severity, number> =
  { normal: 0, attention: 1, warning: 2, critical: 3 };
interface PondRow { public_id: string; name: string }
interface AlertRow { pond_id: string; count: string }
interface Boundary { start_at: Date; end_at: Date }
interface Reading { _time?: string; pond_id?: string; parameter?: string;
  value?: number; validity?: string }

function nextWeek(start: string): string {
  return new Date(Date.parse(`${start}T00:00:00Z`) + 7 * 86_400_000)
    .toISOString().slice(0, 10);
}
function worst(a: Severity, b: Severity): Severity {
  return RANK[a] >= RANK[b] ? a : b;
}

@Injectable()
export class WeeklyWaterQualityService {
  constructor(
    private readonly postgres: PostgresService,
    private readonly influx: InfluxService,
    private readonly thresholds: AdminThresholdsService,
  ) {}

  async snapshot(companyId: string, farmUuid: string, farmId: string,
    timeZone: string, weekStart: string) {
    const boundary = await this.postgres.pool.query<Boundary>(
      `SELECT (($1::date + time '00:00') AT TIME ZONE $3) AS start_at,
         (($2::date + time '00:00') AT TIME ZONE $3) AS end_at`,
      [weekStart, nextWeek(weekStart), timeZone],
    );
    const { start_at: start, end_at: end } = boundary.rows[0];
    const [ponds, alerts, thresholds] = await Promise.all([
      this.postgres.pool.query<PondRow>(
        `SELECT public_id,name FROM ponds WHERE farm_id=$1 ORDER BY name,public_id`,
        [farmUuid],
      ),
      this.postgres.pool.query<AlertRow>(
        `SELECT p.public_id AS pond_id,count(*)::text AS count
         FROM alerts al JOIN ponds p ON p.id=al.pond_id
         WHERE p.farm_id=$1 AND al.occurred_at<$3
           AND (al.resolved_at IS NULL OR al.resolved_at>=$2)
         GROUP BY p.public_id`, [farmUuid, start, end],
      ),
      Promise.all(PARAMETERS.map((parameter) =>
        this.thresholds.effectiveThreshold(companyId, farmUuid, parameter))),
    ]);
    const limits = new Map<Parameter, Threshold>(
      PARAMETERS.map((parameter, index) => [parameter, thresholds[index]]));
    let readings: Reading[];
    try {
      readings = await this.influx.client.getQueryApi(this.influx.org)
        .collectRows<Reading>(
          `from(bucket: ${JSON.stringify(this.influx.bucket)})
           |> range(start: time(v: ${JSON.stringify(start.toISOString())}),
             stop: time(v: ${JSON.stringify(end.toISOString())}))
           |> filter(fn: (r) => r._measurement == "sensor_readings"
             and r.farm_id == ${JSON.stringify(farmId)}
             and (r.parameter == "do" or r.parameter == "ph"
               or r.parameter == "temperature")
             and (r._field == "value" or r._field == "validity"))
           |> pivot(rowKey: ["_time"], columnKey: ["_field"], valueColumn: "_value")
           |> filter(fn: (r) => r.validity == "valid")
           |> keep(columns: ["_time", "pond_id", "parameter", "value"])
           |> group(columns: []) |> limit(n: 300001)`,
        );
    } catch {
      throw new ApiProblem(503, 'storage_unavailable', 'Weekly sensor data is unavailable');
    }
    if (readings.length > 300000) {
      throw new ApiProblem(503, 'weekly_sensor_limit',
        'Weekly sensor data exceeds the processing limit');
    }
    const known = new Set(ponds.rows.map((pond) => pond.public_id));
    const byPond = new Map<string, Reading[]>();
    for (const row of readings) {
      if (!row.pond_id || !known.has(row.pond_id)
        || !PARAMETERS.includes(row.parameter as Parameter)
        || typeof row.value !== 'number' || !Number.isFinite(row.value)
        || !row._time || !Number.isFinite(Date.parse(row._time))) continue;
      const group = byPond.get(row.pond_id) ?? [];
      group.push(row);
      byPond.set(row.pond_id, group);
    }
    const alertCounts = new Map(alerts.rows.map((row) =>
      [row.pond_id, Number(row.count)]));
    const localDate = new Intl.DateTimeFormat('sv-SE', { timeZone });
    return ponds.rows.map((pond) => {
      const points = byPond.get(pond.public_id) ?? [];
      const grouped = new Map<Parameter, Reading[]>(PARAMETERS.map((p) => [p, []]));
      const outDays = new Set<string>();
      for (const point of points) {
        const parameter = point.parameter as Parameter;
        grouped.get(parameter)!.push(point);
        if (severityFor(point.value!, limits.get(parameter)!) !== 'normal') {
          outDays.add(localDate.format(new Date(point._time!)));
        }
      }
      if (PARAMETERS.some((parameter) => !grouped.get(parameter)!.length)) {
        throw new ApiProblem(503, 'weekly_sensor_not_ready',
          `DO, pH and temperature readings are required for ${pond.name}`);
      }
      const extreme = (parameter: Parameter, kind: 'min' | 'max') =>
        grouped.get(parameter)!.reduce((value, point) => kind === 'min'
          ? Math.min(value, point.value!) : Math.max(value, point.value!),
        kind === 'min' ? Infinity : -Infinity);
      const doMin = extreme('do', 'min');
      const phMin = extreme('ph', 'min');
      const phMax = extreme('ph', 'max');
      const temperatureMax = extreme('temperature', 'max');
      const parameterTrend = PARAMETERS.map((parameter) => {
        const series = grouped.get(parameter)!.sort((a, b) =>
          Date.parse(a._time!) - Date.parse(b._time!));
        const firstDay = localDate.format(new Date(series[0]._time!));
        const lastDay = localDate.format(new Date(series.at(-1)!._time!));
        if (firstDay === lastDay) return { parameter, magnitude: 0, change: 0 };
        const average = (day: string) => {
          const values = series.filter((row) =>
            localDate.format(new Date(row._time!)) === day).map((row) => row.value!);
          return values.reduce((sum, value) => sum + value, 0) / values.length;
        };
        const change = average(lastDay) - average(firstDay);
        const threshold = limits.get(parameter)!;
        const span = threshold.attentionLow !== null && threshold.attentionHigh !== null
          ? threshold.attentionHigh - threshold.attentionLow
          : threshold.attentionLow ?? threshold.attentionHigh ?? 1;
        return { parameter, magnitude: Math.abs(change) / Math.max(span, 0.001),
          change };
      }).sort((a, b) => b.magnitude - a.magnitude)[0];
      const trending = parameterTrend.magnitude >= 0.1;
      return { pond: { id: pond.public_id, name: pond.name },
        waterQuality: { doMin, phMin, phMax, temperatureMax,
          outOfRangeDays: outDays.size, alertCount: alertCounts.get(pond.public_id) ?? 0,
          trend: trending ? (parameterTrend.change > 0 ? 'increasing' : 'decreasing')
            : 'stable',
          trendParameter: trending ? parameterTrend.parameter : null,
          severity: {
            doMin: severityFor(doMin, limits.get('do')!),
            ph: worst(severityFor(phMin, limits.get('ph')!),
              severityFor(phMax, limits.get('ph')!)),
            temperatureMax: severityFor(temperatureMax, limits.get('temperature')!),
          } },
      };
    });
  }
}
