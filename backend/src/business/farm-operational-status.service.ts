import { Injectable } from '@nestjs/common';
import { Principal } from '../auth/auth.service';
import { ApiProblem } from '../http/problem';
import { PostgresService } from '../infrastructure/postgres.service';
import { BusinessScopeService } from './business-scope.service';
import { FarmDeviceStatusService } from './farm-device-status.service';

interface FarmRow { id: string; time_zone: string }
interface GeneratorRow { state: 'standby' | 'running' | 'fault'; last_tested_at: Date | null }
interface FeedingRow { rounds_done: string; rounds_planned: string; total_kg: string | null }
interface SamplingRow { next_sampling: string | null }

function localDate(timeZone: string, now: Date): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const part = (type: string) => parts.find((entry) => entry.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

@Injectable()
export class FarmOperationalStatusService {
  constructor(
    private readonly postgres: PostgresService,
    private readonly scope: BusinessScopeService,
    private readonly devices: FarmDeviceStatusService,
  ) {}

  async get(principal: Principal, farmId: string, now = new Date()) {
    if (principal.role !== 'technical_manager') {
      throw new ApiProblem(403, 'forbidden', 'Technical manager access required');
    }
    const visible = await this.scope.visibleFarmIds(principal);
    const farm = await this.postgres.pool.query<FarmRow>(
      `SELECT id,time_zone FROM farms
       WHERE public_id=$1 AND company_id=$2 AND public_id=ANY($3)`,
      [farmId, principal.companyId, visible],
    );
    const row = farm.rows[0];
    if (!row) throw new ApiProblem(404, 'not_found', 'Farm not found');
    const today = localDate(row.time_zone, now);
    const [device, feeding, sampling, generator] = await Promise.all([
      this.devices.snapshot(principal.companyId, row.id, farmId, now),
      this.postgres.pool.query<FeedingRow>(
        `SELECT
          (SELECT count(*)::text FROM feeding_records r
           JOIN ponds p ON p.id=r.pond_id
           WHERE p.farm_id=$1 AND p.status='in_operation'
             AND r.record_date=$2::date) AS rounds_done,
          (SELECT count(*)::text FROM feeding_plan_rounds plan
           JOIN ponds p ON p.id=plan.pond_id
           WHERE p.farm_id=$1 AND p.status='in_operation'
             AND plan.plan_date=$2::date) AS rounds_planned,
          (SELECT sum(r.amount_kg)::text FROM feeding_records r
           JOIN ponds p ON p.id=r.pond_id
           WHERE p.farm_id=$1 AND p.status='in_operation'
             AND r.record_date=$2::date) AS total_kg`, [row.id, today],
      ),
      this.postgres.pool.query<SamplingRow>(
        `SELECT to_char(min(scheduled_on),'YYYY-MM-DD') AS next_sampling
         FROM farm_sampling_schedule WHERE farm_id=$1 AND scheduled_on >= $2::date`,
        [row.id, today],
      ),
      this.postgres.pool.query<GeneratorRow>(
        `SELECT state,last_tested_at FROM farm_generator_states WHERE farm_id=$1`,
        [row.id],
      ),
    ]);
    const currentGenerator = generator.rows[0];
    if (!currentGenerator || device.sensors.neverSeen > 0
      || device.aerators.unknown > 0 || device.pumps.unknown > 0
      || device.equipmentOffline.length > 0) {
      throw new ApiProblem(503, 'operational_status_not_ready',
        'Operational status requires generator and current device states');
    }
    const { neverSeen: _neverSeen, ...sensors } = device.sensors;
    const { unknown: _aeratorUnknown, ...aerators } = device.aerators;
    const { unknown: _pumpUnknown, ...pumps } = device.pumps;
    const feed = feeding.rows[0];
    return {
      aerators, pumps, sensors,
      feedingToday: {
        roundsDone: Number(feed.rounds_done),
        roundsPlanned: Number(feed.rounds_planned),
        ...(feed.total_kg === null ? {} : { totalKg: Number(feed.total_kg) }),
      },
      nextSampling: sampling.rows[0]?.next_sampling ?? null,
      generator: {
        state: currentGenerator.state,
        ...(currentGenerator.last_tested_at
          ? { lastTestedAt: currentGenerator.last_tested_at.toISOString() } : {}),
      },
    };
  }
}
