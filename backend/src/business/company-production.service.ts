import { Injectable } from '@nestjs/common';
import { Principal } from '../auth/auth.service';
import { ApiProblem } from '../http/problem';
import { PostgresService } from '../infrastructure/postgres.service';
import { FarmProductionService } from './farm-production.service';

interface FarmRow { public_id: string }

@Injectable()
export class CompanyProductionService {
  constructor(
    private readonly postgres: PostgresService,
    private readonly farms: FarmProductionService,
  ) {}

  async get(principal: Principal) {
    if (principal.role !== 'farms_manager') {
      throw new ApiProblem(403, 'forbidden', 'Farms manager access required');
    }
    const farms = await this.postgres.pool.query<FarmRow>(
      `SELECT public_id FROM farms WHERE company_id=$1 AND status='active'
       ORDER BY public_id`, [principal.companyId],
    );
    if (!farms.rows.length) {
      throw new ApiProblem(503, 'production_data_not_ready',
        'An active farm is required for production KPIs');
    }
    const production = await Promise.all(farms.rows.map((farm) =>
      this.farms.get(principal, farm.public_id)));
    let biomassKg = 0;
    let stocked = 0;
    let survivors = 0;
    let pondsBehind = 0;
    let pondsTotal = 0;
    let latestSamplingDate = '';
    for (const item of production) {
      biomassKg += item.kpis.biomassKg;
      pondsBehind += item.kpis.growthDistribution.behind;
      pondsTotal += item.ponds.length;
      if (item.samplingDate > latestSamplingDate) latestSamplingDate = item.samplingDate;
      for (const pond of item.ponds) {
        stocked += pond.stockedPl;
        survivors += pond.stockedPl * pond.survivalRatePct / 100;
      }
    }
    return { biomassKg: Math.round(biomassKg * 1_000_000) / 1_000_000,
      survivalRatePct: survivors / stocked * 100,
      pondsBehind, pondsTotal, latestSamplingDate };
  }
}
