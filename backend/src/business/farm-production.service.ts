import { Injectable } from '@nestjs/common';
import { AdminSettingsService } from '../admin/admin-settings.service';
import { Principal } from '../auth/auth.service';
import { ApiProblem } from '../http/problem';
import { PostgresService } from '../infrastructure/postgres.service';
import { BusinessScopeService } from './business-scope.service';
import { targetAt } from './farm-growth-status.service';

interface PondRow {
  public_id: string; name: string; area_ha: string; started_on: string;
  stocked_pl: number | null; initial_biomass_kg: string | null;
  sample_date: string | null; sample_count: number | null;
  sample_weight_g: string | null; prior_date: string | null;
  prior_count: number | null; prior_weight_g: string | null;
  mortality_pcs: string; feed_kg: string;
}

function date(value: string): boolean {
  return /^\d{4}-\d\d-\d\d$/.test(value)
    && Number.isFinite(Date.parse(`${value}T00:00:00Z`))
    && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}

function days(later: string, earlier: string): number {
  return Math.round((Date.parse(`${later}T00:00:00Z`)
    - Date.parse(`${earlier}T00:00:00Z`)) / 86_400_000);
}

function round6(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

@Injectable()
export class FarmProductionService {
  constructor(
    private readonly postgres: PostgresService,
    private readonly scope: BusinessScopeService,
    private readonly settings: AdminSettingsService,
  ) {}

  async get(principal: Principal, farmId: string, samplingDate?: string) {
    if (samplingDate !== undefined && !date(samplingDate)) {
      throw new ApiProblem(422, 'validation_error', 'Invalid sampling date',
        { fieldErrors: [{ field: 'samplingDate', message: 'Must be a valid date' }] });
    }
    const visible = await this.scope.visibleFarmIds(principal);
    const farm = await this.postgres.pool.query<{ id: string }>(
      `SELECT id FROM farms WHERE public_id=$1 AND company_id=$2
       AND public_id=ANY($3)`, [farmId, principal.companyId, visible],
    );
    if (!farm.rows[0]) throw new ApiProblem(404, 'not_found', 'Farm not found');
    const farmUuid = farm.rows[0].id;
    let asOf = samplingDate;
    if (!asOf) {
      const latest = await this.postgres.pool.query<{ sample_date: string | null }>(
        `SELECT to_char(max(s.sample_date),'YYYY-MM-DD') AS sample_date
         FROM sampling_records s JOIN ponds p ON p.id=s.pond_id
         WHERE p.farm_id=$1 AND s.sample_count IS NOT NULL
           AND s.sample_weight_g IS NOT NULL`, [farmUuid],
      );
      asOf = latest.rows[0]?.sample_date ?? undefined;
    }
    if (!asOf) {
      throw new ApiProblem(503, 'production_data_not_ready',
        'A sampling record is required for production KPIs');
    }
    const [growth, ponds] = await Promise.all([
      this.settings.getGrowth({ companyId: principal.companyId,
        actorId: principal.userId }),
      this.postgres.pool.query<PondRow>(
        `SELECT p.public_id,p.name,p.area_ha,
           to_char(c.started_on,'YYYY-MM-DD') AS started_on,
           st.stocked_pl,st.initial_biomass_kg,
           to_char(s.sample_date,'YYYY-MM-DD') AS sample_date,
           s.sample_count,s.sample_weight_g,
           to_char(prior.sample_date,'YYYY-MM-DD') AS prior_date,
           prior.sample_count AS prior_count,
           prior.sample_weight_g AS prior_weight_g,
           COALESCE(m.mortality_pcs,0)::text AS mortality_pcs,
           COALESCE(feed.feed_kg,0)::text AS feed_kg
         FROM ponds p JOIN production_cycles c ON c.pond_id=p.id
           AND c.started_on <= $2::date
           AND (c.ended_on IS NULL OR c.ended_on >= $2::date)
         LEFT JOIN stocking_records st ON st.cycle_id=c.id
         LEFT JOIN LATERAL (
           SELECT sample_date,sample_count,sample_weight_g
           FROM sampling_records WHERE cycle_id=c.id AND sample_date <= $2::date
             AND sample_count IS NOT NULL AND sample_weight_g IS NOT NULL
           ORDER BY sample_date DESC,updated_at DESC LIMIT 1
         ) s ON true
         LEFT JOIN LATERAL (
           SELECT sample_date,sample_count,sample_weight_g
           FROM sampling_records WHERE cycle_id=c.id AND sample_date < s.sample_date
             AND sample_count IS NOT NULL AND sample_weight_g IS NOT NULL
           ORDER BY sample_date DESC LIMIT 1
         ) prior ON true
         LEFT JOIN LATERAL (
           SELECT sum(count) AS mortality_pcs FROM mortality_records
           WHERE pond_id=p.id AND record_date >= c.started_on
             AND record_date <= $2::date
         ) m ON true
         LEFT JOIN LATERAL (
           SELECT sum(amount_kg) AS feed_kg FROM feeding_records
           WHERE pond_id=p.id AND record_date >= c.started_on
             AND record_date <= $2::date
         ) feed ON true
         WHERE p.farm_id=$1 ORDER BY p.name,p.public_id`, [farmUuid, asOf],
      ),
    ]);
    if (!ponds.rows.length) {
      throw new ApiProblem(503, 'production_data_not_ready',
        'An active production cycle is required');
    }
    const distribution = { behind: 0, onTrack: 0, ahead: 0 };
    let totalStocked = 0;
    let totalSurvivors = 0;
    let totalBiomass = 0;
    let totalFeed = 0;
    let totalGain = 0;
    const rows = ponds.rows.map((row) => {
      if (row.stocked_pl === null || row.initial_biomass_kg === null
        || row.sample_date === null || row.sample_count === null
        || row.sample_weight_g === null) {
        throw new ApiProblem(503, 'production_data_not_ready',
          `Stocking, initial biomass and sampling are required for ${row.name}`);
      }
      const doc = days(row.sample_date, row.started_on);
      const target = targetAt(doc, growth.points);
      if (target === null || target <= 0) {
        throw new ApiProblem(503, 'production_data_not_ready',
          `A growth target is required for ${row.name} at DOC ${doc}`);
      }
      const deaths = Number(row.mortality_pcs);
      const survivors = row.stocked_pl - deaths;
      const abw = Number(row.sample_weight_g) / row.sample_count;
      const biomass = survivors * abw / 1000;
      const gain = biomass - Number(row.initial_biomass_kg);
      if (survivors < 0 || gain <= 0) {
        throw new ApiProblem(503, 'production_data_not_ready',
          `Survivors or biomass gain cannot be calculated for ${row.name}`);
      }
      const vsTargetPct = (abw / target - 1) * 100;
      const growthState = vsTargetPct <= -growth.onTrackBandPct ? 'behind'
        : vsTargetPct >= growth.onTrackBandPct ? 'ahead' : 'on_track';
      if (growthState === 'behind') distribution.behind++;
      else if (growthState === 'ahead') distribution.ahead++;
      else distribution.onTrack++;
      const feedKg = Number(row.feed_kg);
      totalStocked += row.stocked_pl;
      totalSurvivors += survivors;
      totalBiomass += biomass;
      totalFeed += feedKg;
      totalGain += gain;
      const priorAbw = row.prior_count === null || row.prior_weight_g === null
        ? null : Number(row.prior_weight_g) / row.prior_count;
      return {
        pond: { id: row.public_id, name: row.name },
        areaHa: Number(row.area_ha), stockedOn: row.started_on,
        stockedPl: row.stocked_pl, doc, abwG: abw, targetAbwG: target,
        vsTargetPct, growth: growthState,
        adgGPerDay: priorAbw === null || row.prior_date === null ? null
          : (abw - priorAbw) / days(row.sample_date, row.prior_date),
        survivalRatePct: survivors / row.stocked_pl * 100,
        fcr: feedKg / gain, biomassKg: round6(biomass),
        sizeUniformityPct: null,
      };
    });
    return {
      samplingDate: asOf,
      kpis: { biomassKg: round6(totalBiomass),
        survivalRatePct: totalSurvivors / totalStocked * 100,
        fcr: totalFeed / totalGain, growthDistribution: distribution },
      ponds: rows,
      growthCurve: growth.points.map((point) =>
        ({ doc: point.doc, targetAbwG: point.targetAbwG })),
    };
  }
}
