import { Injectable } from '@nestjs/common';
import { AdminSettingsService } from '../admin/admin-settings.service';
import { Principal } from '../auth/auth.service';
import { ApiProblem } from '../http/problem';
import { PostgresService } from '../infrastructure/postgres.service';
import { BusinessScopeService } from './business-scope.service';
import { FarmDeviceStatusService } from './farm-device-status.service';
import { FarmGrowthStatusService } from './farm-growth-status.service';
import { PondWaterQualityService } from './pond-water-quality.service';

type Severity = 'normal' | 'attention' | 'warning' | 'critical';
const RANK: Record<Severity, number> =
  { normal: 0, attention: 1, warning: 2, critical: 3 };
interface FarmRow {
  id: string; public_id: string; name: string; location: string;
  time_zone: string; pond_count: string;
}
interface ReportRow { type: 'daily' | 'weekly'; status: string; due_at: Date }
interface TrendRow {
  date: string; status: Severity; water_quality: Severity;
  growth: Severity; operations: Severity;
}

function shift(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000)
    .toISOString().slice(0, 10);
}
function weekStart(date: string): string {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return shift(date, -(day === 0 ? 6 : day - 1));
}

function worst(a: Severity, b: Severity): Severity {
  return RANK[a] >= RANK[b] ? a : b;
}

@Injectable()
export class FarmStatusService {
  constructor(
    private readonly postgres: PostgresService,
    private readonly scope: BusinessScopeService,
    private readonly water: PondWaterQualityService,
    private readonly growth: FarmGrowthStatusService,
    private readonly devices: FarmDeviceStatusService,
    private readonly settings: AdminSettingsService,
  ) {}

  private async farms(principal: Principal): Promise<FarmRow[]> {
    const visible = await this.scope.visibleFarmIds(principal);
    return (await this.postgres.pool.query<FarmRow>(
      `SELECT f.id,f.public_id,f.name,f.location,f.time_zone,
         count(p.id)::text AS pond_count
       FROM farms f LEFT JOIN ponds p ON p.farm_id=f.id
       WHERE f.company_id=$1 AND f.public_id=ANY($2)
       GROUP BY f.id ORDER BY f.name,f.public_id`,
      [principal.companyId, visible],
    )).rows;
  }

  private async summarize(principal: Principal, farm: FarmRow, now: Date) {
    const today = new Intl.DateTimeFormat('sv-SE',
      { timeZone: farm.time_zone }).format(now);
    const monday = weekStart(today);
    const [water, growth, devices, issues, generator, reports, rules] = await Promise.all([
      this.water.snapshot(principal, farm.public_id),
      this.growth.snapshot(principal.companyId, principal.userId, farm.id),
      this.devices.snapshot(principal.companyId, farm.id, farm.public_id, now),
      this.postgres.pool.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM issues
         WHERE farm_id=$1 AND state='ongoing'`, [farm.id],
      ),
      this.postgres.pool.query<{ state: string }>(
        'SELECT state FROM farm_generator_states WHERE farm_id=$1', [farm.id],
      ),
      this.postgres.pool.query<ReportRow>(
        `SELECT type,status,due_at FROM reports WHERE farm_id=$1 AND
         ((type='daily' AND report_date=$2::date)
           OR (type='weekly' AND week_start=$3::date))`,
        [farm.id, today, monday],
      ),
      this.settings.getRules({ companyId: principal.companyId,
        actorId: principal.userId }),
    ]);
    if (!water.items.length || water.items.some((item) =>
      Object.values(item.values).some((value) => value.quality === 'no_data'))
      || growth.sampleBasedStatus === null || !generator.rows[0]
      || devices.sensors.neverSeen > 0 || devices.aerators.unknown > 0
      || devices.pumps.unknown > 0) {
      throw new ApiProblem(503, 'farm_status_not_ready',
        `Current sensor, growth or equipment evidence is missing for ${farm.name}`);
    }
    const affected = water.items.filter((item) => item.status !== 'normal');
    const waterStatus = water.items.reduce((status, item) =>
      worst(status, item.status as Severity), 'normal' as Severity);
    const growthStatus = growth.sampleBasedStatus as Severity;
    const dueDate = shift(monday, 7 + rules.weeklyReportDueWeekday - 1);
    const due = await this.postgres.pool.query<{
      daily_due: Date; weekly_due: Date;
    }>(
      `SELECT (($1::date + $2::time) AT TIME ZONE $3) AS daily_due,
         (($4::date + $5::time) AT TIME ZONE $3) AS weekly_due`,
      [today, rules.dailyReportDue, farm.time_zone,
        dueDate, rules.weeklyReportDueTime],
    );
    const overdue = (['daily', 'weekly'] as const).filter((type) => {
      const report = reports.rows.find((item) => item.type === type);
      const deadline = report?.due_at ?? (type === 'daily'
        ? due.rows[0].daily_due : due.rows[0].weekly_due);
      return report?.status !== 'submitted' && now > deadline;
    }).length;
    const equipmentFaults = devices.equipmentFaults.length
      + (generator.rows[0].state === 'fault' ? 1 : 0);
    const operationalProblems = equipmentFaults + devices.equipmentOffline.length
      + devices.sensors.offline.length + overdue;
    const operationsStatus: Severity = equipmentFaults > 0 ? 'warning'
      : operationalProblems > 0 ? 'attention' : 'normal';
    const waterQuality = { status: waterStatus, count: affected.length,
      fact: `${affected.length} of ${farm.pond_count} Ponds`,
      detail: affected.length ? affected.map((item) => item.pond.name).join(', ') : null };
    const growthAspect = { status: growthStatus, count: growth.behind,
      fact: `${growth.behind} of ${growth.eligible} Ponds behind target`,
      detail: growth.behindPonds.length
        ? growth.behindPonds.map((pond) => pond.name).join(', ') : null };
    const operations = { status: operationsStatus, count: operationalProblems,
      fact: operationalProblems ? `${operationalProblems} operational issues`
        : 'No operational issues',
      detail: operationalProblems ? [
        ...devices.equipmentFaults, ...devices.equipmentOffline,
        ...devices.sensors.offline.map((item) => item.deviceId),
        ...(generator.rows[0].state === 'fault' ? ['Generator'] : []),
        ...(overdue ? ['Overdue reports'] : []),
      ].join(', ') : null };
    const status = worst(worst(waterStatus, growthStatus), operationsStatus);
    await this.postgres.pool.query(
      `INSERT INTO farm_status_daily
         (farm_id,status_date,status,water_quality,growth,operations,computed_at)
       VALUES ($1,$2::date,$3,$4,$5,$6,$7)
       ON CONFLICT (farm_id,status_date) DO UPDATE SET
         status=CASE WHEN array_position(ARRAY['normal','attention','warning','critical'],
           EXCLUDED.status) > array_position(ARRAY['normal','attention','warning','critical'],
           farm_status_daily.status) THEN EXCLUDED.status ELSE farm_status_daily.status END,
         water_quality=CASE WHEN array_position(ARRAY['normal','attention','warning','critical'],
           EXCLUDED.water_quality) > array_position(ARRAY['normal','attention','warning','critical'],
           farm_status_daily.water_quality) THEN EXCLUDED.water_quality
           ELSE farm_status_daily.water_quality END,
         growth=CASE WHEN array_position(ARRAY['normal','attention','warning','critical'],
           EXCLUDED.growth) > array_position(ARRAY['normal','attention','warning','critical'],
           farm_status_daily.growth) THEN EXCLUDED.growth ELSE farm_status_daily.growth END,
         operations=CASE WHEN array_position(ARRAY['normal','attention','warning','critical'],
           EXCLUDED.operations) > array_position(ARRAY['normal','attention','warning','critical'],
           farm_status_daily.operations) THEN EXCLUDED.operations
           ELSE farm_status_daily.operations END,
         computed_at=EXCLUDED.computed_at`,
      [farm.id, today, status, waterStatus, growthStatus, operationsStatus, now],
    );
    const mainReason = status === waterStatus && status !== 'normal'
      ? `Water quality: ${waterQuality.fact}`
      : status === growthStatus && status !== 'normal'
        ? `Growth: ${growthAspect.fact}` : operations.fact;
    return { id: farm.public_id, name: farm.name, location: farm.location,
      pondCount: Number(farm.pond_count), status, mainReason,
      waterQuality, growth: growthAspect, operations,
      openIssues: Number(issues.rows[0]?.count ?? 0) };
  }

  async list(principal: Principal, query: Record<string, unknown>, now = new Date()) {
    const validStatus = ['normal', 'attention', 'warning', 'critical'];
    if (query.status !== undefined && !validStatus.includes(String(query.status))) {
      throw new ApiProblem(422, 'validation_error', 'Invalid status filter');
    }
    for (const field of ['q', 'location']) {
      if (query[field] !== undefined && typeof query[field] !== 'string') {
        throw new ApiProblem(422, 'validation_error', `Invalid ${field} filter`);
      }
    }
    if (query.hasIssues !== undefined && !['true', 'false'].includes(String(query.hasIssues))) {
      throw new ApiProblem(422, 'validation_error', 'Invalid hasIssues filter');
    }
    const farms = await this.farms(principal);
    const all = await Promise.all(farms.map((farm) => this.summarize(principal, farm, now)));
    const counts = { normal: 0, attention: 0, warning: 0, critical: 0 };
    for (const farm of all) counts[farm.status]++;
    const items = all.filter((farm) =>
      (query.status === undefined || farm.status === query.status)
      && (query.q === undefined || farm.name.toLocaleLowerCase()
        .includes((query.q as string).toLocaleLowerCase()))
      && (query.location === undefined || farm.location.toLocaleLowerCase()
        .includes((query.location as string).toLocaleLowerCase()))
      && (query.hasIssues === undefined
        || (farm.openIssues > 0) === (query.hasIssues === 'true')));
    return { items, counts };
  }

  async detail(principal: Principal, farmId: string, now = new Date()) {
    const farm = (await this.farms(principal)).find((item) => item.public_id === farmId);
    if (!farm) throw new ApiProblem(404, 'not_found', 'Farm not found');
    const summary = await this.summarize(principal, farm, now);
    const [managers, cycles, latest] = await Promise.all([
      this.postgres.pool.query<{ public_id: string; name: string }>(
        `SELECT u.public_id,u.name FROM user_farm_assignments a
         JOIN users u ON u.id=a.user_id
         WHERE a.farm_id=$1 AND a.unassigned_at IS NULL
           AND u.role='technical_manager' AND u.status='active'
         ORDER BY u.name,u.public_id`, [farm.id],
      ),
      this.postgres.pool.query<{ min: string | null; max: string | null }>(
        `SELECT min(($2::date-c.started_on))::text AS min,
           max(($2::date-c.started_on))::text AS max
         FROM production_cycles c JOIN ponds p ON p.id=c.pond_id
         WHERE p.farm_id=$1 AND c.started_on<=$2::date
           AND (c.ended_on IS NULL OR c.ended_on>=$2::date)`,
        [farm.id, new Intl.DateTimeFormat('sv-SE',
          { timeZone: farm.time_zone }).format(now)],
      ),
      this.postgres.pool.query<{
        public_id: string; type: string; report_date: string | null;
        week_start: string | null;
      }>(
        `SELECT public_id,type,to_char(report_date,'YYYY-MM-DD') AS report_date,
           to_char(week_start,'YYYY-MM-DD') AS week_start
         FROM reports WHERE farm_id=$1 AND status='submitted'
         ORDER BY submitted_at DESC,id DESC LIMIT 1`, [farm.id],
      ),
    ]);
    if (cycles.rows[0]?.min === null || cycles.rows[0]?.max === null) {
      throw new ApiProblem(503, 'farm_status_not_ready',
        'Production cycle dates are required for Farm detail');
    }
    const report = latest.rows[0];
    return { ...summary,
      technicalManagers: managers.rows.map((manager) =>
        ({ id: manager.public_id, name: manager.name })),
      docRange: { min: Number(cycles.rows[0].min), max: Number(cycles.rows[0].max) },
      updatedAt: now.toISOString(),
      statusSentence: summary.mainReason,
      latestReport: report ? { id: report.public_id, type: report.type,
        label: report.type === 'daily' ? `Daily ${report.report_date}`
          : `Weekly ${report.week_start}`,
        ...(report.type === 'daily' ? { date: report.report_date }
          : { weekStart: report.week_start }) } : null,
    };
  }

  async trend(principal: Principal, farmId: string,
    daysInput: unknown, now = new Date()) {
    const days = daysInput === undefined ? 14 : Number(daysInput);
    if (!Number.isInteger(days) || days < 1 || days > 90
      || (daysInput !== undefined && typeof daysInput !== 'string')) {
      throw new ApiProblem(422, 'validation_error', 'days must be an integer from 1 to 90');
    }
    const farm = (await this.farms(principal)).find((item) => item.public_id === farmId);
    if (!farm) throw new ApiProblem(404, 'not_found', 'Farm not found');
    await this.summarize(principal, farm, now);
    const today = new Intl.DateTimeFormat('sv-SE',
      { timeZone: farm.time_zone }).format(now);
    const result = await this.postgres.pool.query<TrendRow>(
      `SELECT to_char(status_date,'YYYY-MM-DD') AS date,status,
         water_quality,growth,operations FROM farm_status_daily
       WHERE farm_id=$1 AND status_date > ($2::date-$3::integer)
         AND status_date <= $2::date ORDER BY status_date`,
      [farm.id, today, days],
    );
    return { items: result.rows.map((row) => ({
      date: row.date, status: row.status,
      waterQuality: row.water_quality, growth: row.growth,
      operations: row.operations,
    })) };
  }
}
