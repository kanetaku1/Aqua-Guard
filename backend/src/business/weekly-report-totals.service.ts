import { Injectable } from '@nestjs/common';
import { ApiProblem } from '../http/problem';
import { PostgresService } from '../infrastructure/postgres.service';

interface PondRow {
  id: string; public_id: string; name: string; stocked_pl: number | null;
}
interface FeedingRow {
  pond_id: string; record_date: string; amount_kg: string;
}
interface MortalityRow {
  pond_id: string; record_date: string; count: number; weight_kg: string;
}
interface AppetiteRow { pond_id: string; report_date: string; appetite: string }
interface Totals { current: number; previous: number; currentRecords: number;
  previousRecords: number }

function shift(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000)
    .toISOString().slice(0, 10);
}
function change(current: number, previous: number): number | null {
  return previous > 0 ? (current / previous - 1) * 100 : null;
}
function per10k(count: number, stocked: number | null): number | null {
  return stocked !== null && stocked > 0 ? count / stocked * 10_000 : null;
}
function kilograms(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

@Injectable()
export class WeeklyReportTotalsService {
  constructor(private readonly postgres: PostgresService) {}

  async snapshot(farmUuid: string, weekStart: string) {
    const parsed = Date.parse(`${weekStart}T00:00:00Z`);
    if (!/^\d{4}-\d\d-\d\d$/.test(weekStart) || !Number.isFinite(parsed)
      || new Date(parsed).toISOString().slice(0, 10) !== weekStart
      || new Date(parsed).getUTCDay() !== 1) {
      throw new ApiProblem(422, 'validation_error', 'Week start must be a Monday',
        { fieldErrors: [{ field: 'weekStart', message: 'Must be a Monday date' }] });
    }
    const previousStart = shift(weekStart, -7);
    const nextStart = shift(weekStart, 7);
    const weekEnd = shift(weekStart, 6);
    const [ponds, feeding, mortality, appetite] = await Promise.all([
      this.postgres.pool.query<PondRow>(
        `SELECT p.id,p.public_id,p.name,s.stocked_pl
         FROM ponds p
         LEFT JOIN LATERAL (
           SELECT st.stocked_pl FROM production_cycles c
           JOIN stocking_records st ON st.cycle_id=c.id
           WHERE c.pond_id=p.id AND c.started_on<=$2::date
             AND (c.ended_on IS NULL OR c.ended_on >= $2::date)
           ORDER BY c.started_on DESC LIMIT 1
         ) s ON true
         WHERE p.farm_id=$1 ORDER BY p.name,p.public_id`, [farmUuid, weekEnd],
      ),
      this.postgres.pool.query<FeedingRow>(
        `SELECT r.pond_id,to_char(r.record_date,'YYYY-MM-DD') AS record_date,
           r.amount_kg::text AS amount_kg
         FROM feeding_records r JOIN ponds p ON p.id=r.pond_id
         WHERE p.farm_id=$1 AND r.record_date >= $2::date
           AND r.record_date < $3::date`,
        [farmUuid, previousStart, nextStart],
      ),
      this.postgres.pool.query<MortalityRow>(
        `SELECT r.pond_id,to_char(r.record_date,'YYYY-MM-DD') AS record_date,
           r.count,r.weight_kg::text AS weight_kg
         FROM mortality_records r JOIN ponds p ON p.id=r.pond_id
         WHERE p.farm_id=$1 AND r.record_date >= $2::date
           AND r.record_date < $3::date`,
        [farmUuid, previousStart, nextStart],
      ),
      this.postgres.pool.query<AppetiteRow>(
        `SELECT i.pond_id,to_char(r.report_date,'YYYY-MM-DD') AS report_date,
           i.appetite
         FROM daily_report_pond_inputs i JOIN reports r ON r.id=i.report_id
         WHERE r.farm_id=$1 AND r.type='daily'
           AND r.report_date >= $2::date AND r.report_date < $3::date
           AND i.appetite IS NOT NULL`,
        [farmUuid, weekStart, nextStart],
      ),
    ]);
    const pondIds = new Set(ponds.rows.map((pond) => pond.id));
    const feed = new Map<string, Totals>();
    const deaths = new Map<string, Totals>();
    const deathKg = new Map<string, number>();
    const dailyDeaths = new Map<string, Map<string, number>>();
    const reducedDays = new Map<string, Set<string>>();
    const totals = (map: Map<string, Totals>, id: string) => {
      const item = map.get(id) ?? {
        current: 0, previous: 0, currentRecords: 0, previousRecords: 0,
      };
      map.set(id, item);
      return item;
    };
    for (const row of feeding.rows) {
      if (!pondIds.has(row.pond_id)) continue;
      const item = totals(feed, row.pond_id);
      if (row.record_date >= weekStart) {
        item.current += Number(row.amount_kg);
        item.currentRecords++;
      } else {
        item.previous += Number(row.amount_kg);
        item.previousRecords++;
      }
    }
    for (const row of mortality.rows) {
      if (!pondIds.has(row.pond_id)) continue;
      const item = totals(deaths, row.pond_id);
      if (row.record_date >= weekStart) {
        item.current += row.count;
        item.currentRecords++;
        deathKg.set(row.pond_id,
          (deathKg.get(row.pond_id) ?? 0) + Number(row.weight_kg));
        const daily = dailyDeaths.get(row.pond_id) ?? new Map<string, number>();
        daily.set(row.record_date, (daily.get(row.record_date) ?? 0) + row.count);
        dailyDeaths.set(row.pond_id, daily);
      } else {
        item.previous += row.count;
        item.previousRecords++;
      }
    }
    for (const row of appetite.rows) {
      if (!pondIds.has(row.pond_id)) continue;
      if (row.appetite === 'good') continue;
      const dates = reducedDays.get(row.pond_id) ?? new Set<string>();
      dates.add(row.report_date);
      reducedDays.set(row.pond_id, dates);
    }
    const previousFeed = feeding.rows.some((row) => row.record_date < weekStart);
    const previousDeaths = mortality.rows.some((row) => row.record_date < weekStart);
    const stockedTotal = ponds.rows.every((pond) => pond.stocked_pl !== null)
      ? ponds.rows.reduce((sum, pond) => sum + Number(pond.stocked_pl), 0) : null;
    const feedingRows = ponds.rows.map((pond) => {
      const item = totals(feed, pond.id);
      return {
        pond: { id: pond.public_id, name: pond.name },
        value: kilograms(item.current),
        changePct: change(item.current, item.previous),
        reducedAppetiteDays: appetite.rows.length
          ? reducedDays.get(pond.id)?.size ?? 0 : null,
      };
    });
    const mortalityRows = ponds.rows.map((pond) => {
      const item = totals(deaths, pond.id);
      const peak = [...(dailyDeaths.get(pond.id) ?? new Map())]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
      return {
        pond: { id: pond.public_id, name: pond.name }, value: item.current,
        changePct: change(item.current, item.previous),
        per10kStocked: per10k(item.current, pond.stocked_pl),
        peakDate: peak?.[0] ?? null, peakValue: peak?.[1] ?? null,
      };
    });
    const feedTotal = kilograms(feedingRows.reduce((sum, row) => sum + row.value, 0));
    const deathTotal = mortalityRows.reduce((sum, row) => sum + row.value, 0);
    return {
      feeding: {
        unit: 'kg', total: feedTotal,
        previousTotal: previousFeed
          ? kilograms([...feed.values()].reduce((sum, item) => sum + item.previous, 0))
          : null,
        reducedAppetitePonds: appetite.rows.length
          ? [...reducedDays.values()].filter((days) => days.size > 0).length : null,
        byPond: feedingRows,
      },
      mortality: {
        unit: 'pcs', total: deathTotal,
        previousTotal: previousDeaths
          ? [...deaths.values()].reduce((sum, item) => sum + item.previous, 0) : null,
        totalKg: kilograms([...deathKg.values()].reduce((sum, value) => sum + value, 0)),
        per10kStocked: per10k(deathTotal, stockedTotal),
        byPond: mortalityRows,
      },
    };
  }
}
