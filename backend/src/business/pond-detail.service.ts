import { Injectable } from '@nestjs/common';
import { Principal } from '../auth/auth.service';
import { ApiProblem } from '../http/problem';
import { PostgresService } from '../infrastructure/postgres.service';
import { BusinessScopeService } from './business-scope.service';
import { PondPlanningService } from './pond-planning.service';
import { SensorCurrentService } from './sensor-current.service';

type Severity = 'normal' | 'attention' | 'warning' | 'critical';
const RANK: Record<Severity, number> = { normal: 0, attention: 1, warning: 2, critical: 3 };
interface PondRow {
  pond_name: string; farm_name: string; area_ha: string; updated_at: Date;
}
interface SampleRow { sample_count: number; sample_weight_g: string }
interface AlertRow { severity: Severity }

@Injectable()
export class PondDetailService {
  constructor(
    private readonly postgres: PostgresService,
    private readonly scope: BusinessScopeService,
    private readonly planning: PondPlanningService,
    private readonly current: SensorCurrentService,
  ) {}

  async get(principal: Principal, pondId: string) {
    if (principal.role !== 'technical_manager') {
      throw new ApiProblem(403, 'forbidden', 'Technical manager access required');
    }
    const target = await this.scope.requirePond(principal, pondId);
    const [pond, planning, sample, alerts, sensors] = await Promise.all([
      this.postgres.pool.query<PondRow>(
        `SELECT p.name AS pond_name,f.name AS farm_name,p.area_ha,p.updated_at
         FROM ponds p JOIN farms f ON f.id=p.farm_id WHERE p.id=$1`, [target.pondUuid],
      ),
      this.planning.snapshot(target.pondUuid),
      this.postgres.pool.query<SampleRow>(
        `SELECT s.sample_count,s.sample_weight_g FROM sampling_records s
         JOIN production_cycles c ON c.id=s.cycle_id AND c.status='active'
         WHERE s.pond_id=$1 AND s.sample_count IS NOT NULL
           AND s.sample_weight_g IS NOT NULL
         ORDER BY s.sample_date DESC,s.updated_at DESC LIMIT 1`, [target.pondUuid],
      ),
      this.postgres.pool.query<AlertRow>(
        `SELECT severity FROM alerts WHERE pond_id=$1 AND state<>'resolved'`,
        [target.pondUuid],
      ),
      this.current.get(principal, pondId),
    ]);
    const row = pond.rows[0];
    if (!row) throw new ApiProblem(404, 'not_found', 'Pond not found');
    let status: Severity = 'normal';
    for (const item of sensors.items) {
      if (RANK[item.severity] > RANK[status]) status = item.severity;
    }
    for (const alert of alerts.rows) {
      if (RANK[alert.severity] > RANK[status]) status = alert.severity;
    }
    const latest = sample.rows[0];
    return {
      pond: { id: target.pondId, name: row.pond_name },
      farm: { id: target.farmId, name: row.farm_name },
      status, areaHa: Number(row.area_ha),
      stockedOn: planning.stockedOn, doc: planning.doc, stockedPl: planning.stockedPl,
      abwG: latest ? Number(latest.sample_weight_g) / latest.sample_count : null,
      openAlerts: alerts.rows.length,
      feeding: planning.feeding,
      updatedAt: row.updated_at.toISOString(),
    };
  }
}
