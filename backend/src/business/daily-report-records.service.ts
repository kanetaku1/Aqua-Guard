import { Injectable } from '@nestjs/common';
import { PostgresService } from '../infrastructure/postgres.service';

interface RecordRow {
  pond_id: string; pond_name: string;
  feed_kg: string; feed_rounds: string; planned_rounds: string;
  feed_type: string | null; mortality_pcs: string; mortality_kg: string;
}
interface TotalsRow { feed_kg: string; mortality_pcs: string; mortality_kg: string }

@Injectable()
export class DailyReportRecordsService {
  constructor(private readonly postgres: PostgresService) {}

  async snapshot(farmUuid: string, date: string) {
    const [result, summed] = await Promise.all([
      this.postgres.pool.query<RecordRow>(
      `SELECT p.public_id AS pond_id,p.name AS pond_name,
         COALESCE(feed.feed_kg,0)::text AS feed_kg,
         COALESCE(feed.feed_rounds,0)::text AS feed_rounds,
         COALESCE(plan.planned_rounds,0)::text AS planned_rounds,
         latest.feed_type,
         COALESCE(mortality.mortality_pcs,0)::text AS mortality_pcs,
         COALESCE(mortality.mortality_kg,0)::text AS mortality_kg
       FROM ponds p
       LEFT JOIN LATERAL (
         SELECT sum(r.amount_kg) AS feed_kg,count(*) AS feed_rounds
         FROM feeding_records r WHERE r.pond_id=p.id AND r.record_date=$2::date
       ) feed ON true
       LEFT JOIN LATERAL (
         SELECT r.feed_type FROM feeding_records r
         WHERE r.pond_id=p.id AND r.record_date=$2::date
         ORDER BY r.round_no DESC,r.updated_at DESC LIMIT 1
       ) latest ON true
       LEFT JOIN LATERAL (
         SELECT count(*) AS planned_rounds FROM feeding_plan_rounds plan
         WHERE plan.pond_id=p.id AND plan.plan_date=$2::date
       ) plan ON true
       LEFT JOIN LATERAL (
         SELECT sum(m.count) AS mortality_pcs,sum(m.weight_kg) AS mortality_kg
         FROM mortality_records m
         WHERE m.pond_id=p.id AND m.record_date=$2::date
       ) mortality ON true
       WHERE p.farm_id=$1 ORDER BY p.name,p.public_id`,
        [farmUuid, date],
      ),
      this.postgres.pool.query<TotalsRow>(
        `SELECT
           (SELECT COALESCE(sum(r.amount_kg),0)::text
            FROM feeding_records r JOIN ponds p ON p.id=r.pond_id
            WHERE p.farm_id=$1 AND r.record_date=$2::date) AS feed_kg,
           (SELECT COALESCE(sum(m.count),0)::text
            FROM mortality_records m JOIN ponds p ON p.id=m.pond_id
            WHERE p.farm_id=$1 AND m.record_date=$2::date) AS mortality_pcs,
           (SELECT COALESCE(sum(m.weight_kg),0)::text
            FROM mortality_records m JOIN ponds p ON p.id=m.pond_id
            WHERE p.farm_id=$1 AND m.record_date=$2::date) AS mortality_kg`,
        [farmUuid, date],
      ),
    ]);
    const ponds = result.rows.map((row) => ({
      pond: { id: row.pond_id, name: row.pond_name },
      feedKg: Number(row.feed_kg), feedRounds: Number(row.feed_rounds),
      feedRoundsPlanned: Number(row.planned_rounds), feedType: row.feed_type,
      mortalityPcs: Number(row.mortality_pcs),
      mortalityKg: Number(row.mortality_kg),
    }));
    const totals = summed.rows[0];
    return { ponds, totals: {
      feedKg: Number(totals.feed_kg),
      mortalityPcs: Number(totals.mortality_pcs),
      mortalityKg: Number(totals.mortality_kg),
    } };
  }
}
