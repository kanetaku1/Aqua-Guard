import { Injectable } from '@nestjs/common';
import { PostgresService } from '../infrastructure/postgres.service';

interface StockingRow { stocked_on: string; stocked_pl: number }
interface PlanRow {
  round_no: number; scheduled_at: string; feed_type: string;
  amount_kg: string; note: string | null;
}

function validDate(value: string): boolean {
  return /^\d{4}-\d\d-\d\d$/.test(value)
    && Number.isFinite(Date.parse(`${value}T00:00:00Z`))
    && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}

export function jakartaDate(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const part = (type: string) => parts.find((entry) => entry.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

@Injectable()
export class PondPlanningService {
  constructor(private readonly postgres: PostgresService) {}

  async snapshot(pondUuid: string, onDate = jakartaDate()) {
    if (!validDate(onDate)) throw new Error('Pond planning date must be YYYY-MM-DD');
    const [stocking, plan] = await Promise.all([
      this.postgres.pool.query<StockingRow>(
        `SELECT to_char(s.stocked_on,'YYYY-MM-DD') AS stocked_on,s.stocked_pl
         FROM stocking_records s JOIN production_cycles c ON c.id=s.cycle_id
         WHERE s.pond_id=$1 AND c.status='active' AND s.stocked_on <= $2::date
         ORDER BY s.stocked_on DESC LIMIT 1`, [pondUuid, onDate],
      ),
      this.postgres.pool.query<PlanRow>(
        `SELECT round_no,to_char(scheduled_at,'HH24:MI') AS scheduled_at,
           feed_type,amount_kg,note
         FROM feeding_plan_rounds WHERE pond_id=$1 AND plan_date=$2::date
         ORDER BY round_no`, [pondUuid, onDate],
      ),
    ]);
    const current = stocking.rows[0];
    if (plan.rows.some((row, index) => row.round_no !== index + 1)) {
      throw new Error('Feeding plan rounds must be contiguous from 1');
    }
    const doc = current ? Math.round((Date.parse(`${onDate}T00:00:00Z`)
      - Date.parse(`${current.stocked_on}T00:00:00Z`)) / 86_400_000) : null;
    return {
      stockedOn: current?.stocked_on ?? null,
      stockedPl: current?.stocked_pl ?? null,
      doc,
      feeding: {
        schedule: plan.rows.map((row) => row.scheduled_at),
        feedTypes: [...new Set(plan.rows.map((row) => row.feed_type))],
        planToday: plan.rows.map((row) => ({ round: row.round_no,
          amountKg: Number(row.amount_kg), note: row.note })),
      },
    };
  }
}
