import { Injectable } from '@nestjs/common';
import { Principal } from '../auth/auth.service';
import { AdminSettingsService } from '../admin/admin-settings.service';
import { ApiProblem } from '../http/problem';
import { InfluxService } from '../infrastructure/influx.service';
import { PostgresService } from '../infrastructure/postgres.service';
import { BusinessScopeService } from './business-scope.service';
import { targetAt } from './farm-growth-status.service';
import { jakartaDate, PondPlanningService } from './pond-planning.service';
import { PondWaterQualityService } from './pond-water-quality.service';

interface PondRow {
  id: string; public_id: string; name: string; area_ha: string;
  sample_date: string | null; sample_count: number | null;
  sample_weight_g: string | null; cycle_started_on: string | null;
  feed_kg: string | null; feed_rounds: string; mortality_pcs: string | null;
}
interface AeratorRow { device_id: string; pond_id: string; assigned_at: Date }
interface FeedbackRow { _time?: string; pond_id?: string; device_id?: string; _value?: unknown }

function invalid(field: string): never {
  throw new ApiProblem(422, 'validation_error', 'Invalid Pond list filter', {
    fieldErrors: [{ field, message: 'Unsupported value' }],
  });
}

function days(later: string, earlier: string): number {
  return Math.round((Date.parse(`${later}T00:00:00Z`)
    - Date.parse(`${earlier}T00:00:00Z`)) / 86_400_000);
}

@Injectable()
export class PondListService {
  constructor(
    private readonly postgres: PostgresService,
    private readonly influx: InfluxService,
    private readonly scope: BusinessScopeService,
    private readonly water: PondWaterQualityService,
    private readonly planning: PondPlanningService,
    private readonly settings: AdminSettingsService,
  ) {}

  async list(principal: Principal, farmId: string, query: Record<string, unknown>) {
    if (principal.role !== 'technical_manager') {
      throw new ApiProblem(403, 'forbidden', 'Technical manager access required');
    }
    const statusFilter = query.status === undefined ? null : query.status;
    const alertFilter = query.alertState === undefined ? null : query.alertState;
    if (statusFilter !== null && (typeof statusFilter !== 'string'
      || !['normal', 'attention', 'warning', 'critical'].includes(statusFilter))) {
      invalid('status');
    }
    if (alertFilter !== null && (typeof alertFilter !== 'string'
      || !['unacknowledged', 'acknowledged', 'in_progress', 'resolved']
        .includes(alertFilter))) invalid('alertState');
    const visible = await this.scope.visibleFarmIds(principal);
    const farm = await this.postgres.pool.query<{ id: string }>(
      `SELECT id FROM farms WHERE public_id=$1 AND company_id=$2 AND public_id=ANY($3)`,
      [farmId, principal.companyId, visible],
    );
    if (!farm.rows[0]) throw new ApiProblem(404, 'not_found', 'Farm not found');
    const farmUuid = farm.rows[0].id;
    const today = jakartaDate();
    const [water, growth, ponds, aerators, feedback, heartbeat, rules] = await Promise.all([
      this.water.list(principal, farmId),
      this.settings.getGrowth({ companyId: principal.companyId, actorId: principal.userId }),
      this.postgres.pool.query<PondRow>(
        `SELECT p.id,p.public_id,p.name,p.area_ha,
           to_char(c.started_on,'YYYY-MM-DD') AS cycle_started_on,
           to_char(s.sample_date,'YYYY-MM-DD') AS sample_date,
           s.sample_count,s.sample_weight_g,
           (SELECT sum(amount_kg)::text FROM feeding_records r
             WHERE r.pond_id=p.id AND r.record_date=$2::date) AS feed_kg,
           (SELECT count(*)::text FROM feeding_records r
             WHERE r.pond_id=p.id AND r.record_date=$2::date) AS feed_rounds,
           (SELECT sum(count)::text FROM mortality_records m
             WHERE m.pond_id=p.id AND m.record_date=$2::date) AS mortality_pcs
         FROM ponds p LEFT JOIN production_cycles c ON c.pond_id=p.id AND c.status='active'
         LEFT JOIN LATERAL (
           SELECT sample_date,sample_count,sample_weight_g FROM sampling_records
           WHERE cycle_id=c.id AND sample_count IS NOT NULL AND sample_weight_g IS NOT NULL
           ORDER BY sample_date DESC,updated_at DESC LIMIT 1
         ) s ON true
         WHERE p.farm_id=$1 ORDER BY p.name,p.public_id`, [farmUuid, today],
      ),
      this.postgres.pool.query<AeratorRow>(
        `SELECT d.device_id,p.public_id AS pond_id,a.assigned_at
         FROM devices d JOIN device_assignments a ON a.device_id=d.id
           AND a.unassigned_at IS NULL
         JOIN ponds p ON p.id=a.pond_id
         WHERE p.farm_id=$1 AND d.type='aerator' AND d.enabled`, [farmUuid],
      ),
      this.latest(farmId, 'actuator_feedback', 'state'),
      this.latest(farmId, 'device_heartbeats', 'online_hint'),
      this.postgres.pool.query<{ sensor_offline_after_minutes: number }>(
        `SELECT sensor_offline_after_minutes FROM operational_rule_versions
         WHERE company_id=$1 AND effective_to IS NULL`, [principal.companyId],
      ),
    ]);
    const waterByPond = new Map(water.items.map((item) => [item.pond.id, item]));
    const feedbackByDevice = new Map(feedback.map((row) => [`${row.pond_id}:${row.device_id}`, row]));
    const heartbeatByDevice = new Map(heartbeat.map((row) => [`${row.pond_id}:${row.device_id}`, row]));
    const offlineMs = (rules.rows[0]?.sensor_offline_after_minutes ?? 60) * 60_000;
    const now = Date.now();
    const selectedPonds = ponds.rows.filter((pond) => {
      const quality = waterByPond.get(pond.public_id);
      return quality && (statusFilter === null || quality.status === statusFilter)
        && (alertFilter === null || quality.worstAlertState === alertFilter);
    });
    const all = await Promise.all(selectedPonds.map(async (pond) => {
      const quality = waterByPond.get(pond.public_id);
      if (!quality || Object.values(quality.values).some((value) =>
        value.quality !== 'live' && value.quality !== 'delayed')) {
        throw new ApiProblem(503, 'telemetry_not_ready', 'Pond sensor data is incomplete or stale');
      }
      const plan = await this.planning.snapshot(pond.id, today);
      const sampleDate = pond.sample_date;
      const abwG = pond.sample_count && pond.sample_weight_g !== null
        ? Number(pond.sample_weight_g) / pond.sample_count : null;
      const target = sampleDate && pond.cycle_started_on
        ? targetAt(days(sampleDate, pond.cycle_started_on), growth.points) : null;
      const vsTargetPct = abwG !== null && target !== null && target > 0
        ? (abwG / target - 1) * 100 : null;
      const growthJudgement = vsTargetPct === null ? null
        : vsTargetPct <= -growth.onTrackBandPct ? 'behind'
        : vsTargetPct >= growth.onTrackBandPct ? 'ahead' : 'on_track';
      const assigned = aerators.rows.filter((device) => device.pond_id === pond.public_id);
      let on = 0;
      for (const device of assigned) {
        const key = `${pond.public_id}:${device.device_id}`;
        const state = feedbackByDevice.get(key);
        const beat = heartbeatByDevice.get(key);
        const stateAt = Date.parse(state?._time ?? '');
        const beatAt = Date.parse(beat?._time ?? '');
        const validState = Number.isFinite(stateAt) && stateAt >= device.assigned_at.getTime()
          && stateAt <= now && now - stateAt <= offlineMs;
        const validBeat = Number.isFinite(beatAt) && beatAt >= device.assigned_at.getTime()
          && beatAt <= now && now - beatAt <= offlineMs;
        if (!validState || (validBeat && beatAt > stateAt && beat?._value === false)
          || !['on', 'off', 'fault'].includes(String(state?._value))) {
          throw new ApiProblem(503, 'telemetry_not_ready', 'Aerator state is incomplete or stale');
        }
        if (state?._value === 'on') on++;
      }
      return { pond: { id: pond.public_id, name: pond.name },
        areaHa: Number(pond.area_ha), stockedOn: plan.stockedOn, doc: plan.doc,
        status: quality.status, openAlerts: quality.openAlerts,
        worstAlertState: quality.worstAlertState,
        abwG, vsTargetPct, growth: growthJudgement,
        feedTodayKg: pond.feed_kg === null ? null : Number(pond.feed_kg),
        feedRoundsToday: Number(pond.feed_rounds),
        feedRoundsPlanned: plan.feeding.schedule.length,
        mortalityTodayPcs: pond.mortality_pcs === null ? null : Number(pond.mortality_pcs),
        aerators: { on, total: assigned.length }, sampleDate };
    }));
    const items = all
      .map(({ sampleDate: _sampleDate, ...item }) => item);
    const sampleDates = all.map((item) => item.sampleDate)
      .filter((date): date is string => !!date);
    return { items, latestSamplingDate: sampleDates.sort().at(-1) ?? null };
  }

  private async latest(farmId: string, measurement: string, field: string): Promise<FeedbackRow[]> {
    try {
      return await this.influx.client.getQueryApi(this.influx.org).collectRows<FeedbackRow>(
        `from(bucket: ${JSON.stringify(this.influx.bucket)}) |> range(start: 0)
         |> filter(fn: (r) => r._measurement == ${JSON.stringify(measurement)}
           and r.farm_id == ${JSON.stringify(farmId)}
           and r._field == ${JSON.stringify(field)})
         |> group(columns: ["pond_id","device_id"]) |> last()`,
      );
    } catch {
      throw new ApiProblem(503, 'storage_unavailable', 'Actuator telemetry is unavailable');
    }
  }
}
