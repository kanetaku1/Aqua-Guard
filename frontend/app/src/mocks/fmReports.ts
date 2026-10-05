import type { components } from '@/api/schema'
import type { Severity } from '@/api/types'
import { farms, generatedProduction } from './company'

/**
 * Submitted reports of the other Farms (B–D) and earlier weeks, for the Farms Manager list (FM-04,
 * prototype screens/fm-reports.html). Values are generic but consistent with each Farm's size and status.
 */

type S = components['schemas']
const wib = (date: string, time: string) => new Date(`${date}T${time}:00+07:00`).toISOString()
const TMS: Record<string, { id: string; name: string }> = {
  'farm-a': { id: 'u-sari', name: 'Sari Wijaya' },
  'farm-b': { id: 'u-budi', name: 'Budi Santoso' },
  'farm-c': { id: 'u-dewi', name: 'Dewi Lestari' },
  'farm-d': { id: 'u-agus', name: 'Agus Pratama' },
}
const pondRef = (farmId: string, n: number) => ({ id: `${farmId}-pond-${String(n).padStart(2, '0')}`, name: `Pond ${String(n).padStart(2, '0')}` })

/** [farmId, date, submitted time, alerts, farm status] — prototype FM-04 list. */
export const OTHER_DAILY: [string, string, string, number, Severity][] = [
  ['farm-b', '2026-09-28', '17:55', 0, 'normal'],
  ['farm-c', '2026-09-28', '18:40', 1, 'attention'],
  ['farm-d', '2026-09-28', '19:05', 2, 'warning'],
  ['farm-b', '2026-09-27', '17:48', 0, 'normal'],
  ['farm-c', '2026-09-27', '18:30', 0, 'normal'],
  ['farm-d', '2026-09-27', '19:12', 1, 'warning'],
]

export function genericDaily(farmId: string, date: string, time: string, alertCount: number, farmStatus: Severity): S['DailyReport'] {
  const farm = farms.find((f) => f.id === farmId)!
  const n = farm.pondCount
  const ponds: S['DailyPondRow'][] = Array.from({ length: n }, (_, i) => {
    const no = i + 1
    const flagged = alertCount > 0 && no === 3 // Pond of the first alert
    const pcs = 10 + ((no * 7) % 12)
    return {
      pond: pondRef(farmId, no),
      feedKg: 120 + ((no * 13) % 70),
      feedRounds: 4,
      feedRoundsPlanned: 4,
      feedType: no <= n / 2 ? 'Grower 2' : 'Grower 1',
      appetite: flagged ? 'reduced' : 'good',
      tray: 'clean',
      mortalityPcs: pcs,
      mortalityKg: Math.round(pcs * 0.013 * 100) / 100,
      mortalityNote: null,
      health: flagged ? 'attention' : 'normal',
      observations: flagged ? ['reduced_appetite'] : [],
      healthNote: null,
      aerators: { on: 2, total: 2 },
    }
  })
  const alerts: S['DailyReport']['alerts'] = Array.from({ length: alertCount }, (_, i) => ({
    id: `ALT-${farmId.slice(-1).toUpperCase()}${date.slice(8)}${i}`,
    pond: pondRef(farmId, 3 + i * 3),
    title: i === 0 ? 'DO below threshold' : 'Turbidity above range',
    parameter: i === 0 ? 'do' : 'turbidity',
    severity: i === 0 ? 'warning' : 'attention',
    state: 'resolved',
    value: null,
    thresholdValue: null,
    unit: null,
    direction: null,
    occurredAt: wib(date, i === 0 ? '05:10' : '13:30'),
    resolvedAt: wib(date, i === 0 ? '06:40' : '15:00'),
    handledBy: TMS[farmId],
    durationMinutes: 90,
    excluded: false,
  }))
  const sum = (f: (p: S['DailyPondRow']) => number) => ponds.reduce((s, p) => s + f(p), 0)
  const report: S['DailyReport'] = {
    id: `daily-${farmId}-${date}`,
    type: 'daily',
    farm: { id: farm.id, name: farm.name },
    date,
    technicalManager: TMS[farmId],
    status: 'submitted',
    issueCount: alertCount,
    submittedAt: wib(date, time),
    dueAt: wib(date, '18:00'),
    savedAt: wib(date, time),
    farmStatus,
    ponds,
    totals: {
      feedKg: sum((p) => p.feedKg),
      mortalityPcs: sum((p) => p.mortalityPcs),
      mortalityKg: Math.round(sum((p) => p.mortalityKg) * 100) / 100,
      reducedAppetitePonds: ponds.filter((p) => p.appetite !== 'good').length,
      leftoverTrayPonds: 0,
      healthNotedPonds: ponds.filter((p) => p.health !== 'normal').length,
    },
    environment: { weather: alertCount ? 'cloudy' : 'sunny', rainfallMm: alertCount ? 2 : 0, events: null },
    equipmentEvents: [],
    alerts,
    actions: alerts.map((a, i) => ({
      id: `act-${a.id}`,
      source: 'alert_handling' as const,
      at: wib(date, i === 0 ? '05:20' : '13:45'),
      pond: a.pond,
      action: i === 0 ? 'Increased aeration' : 'Water exchange 10%',
      outcome: i === 0 ? 'DO back in range by 06:40' : 'Turbidity back in range by 15:00',
    })),
    summary: alertCount
      ? `${alerts.map((a) => `${a.pond.name} ${a.title.toLowerCase()}`).join('; ')} — handled and resolved the same day. No abnormal mortality.`
      : 'A calm day. All Ponds within range, feeding as planned and no abnormal mortality.',
    previousReportId: null,
    nextReportId: null,
    previousReportDate: null,
    nextReportDate: null,
  }
  report.pondsNeedingAttention = new Set([...ponds.filter((p) => p.health !== 'normal').map((p) => p.pond.id), ...alerts.map((a) => a.pond.id)]).size
  report.feedKg = report.totals.feedKg
  report.mortalityPcs = report.totals.mortalityPcs
  return report
}

/** [farmId, weekStart, weekEnd, submitted date, time, major issues, condition] — prototype FM-04 weekly list. */
export const OTHER_WEEKLY: [string, string, string, string, string, number, Severity][] = [
  ['farm-b', '2026-09-15', '2026-09-21', '2026-09-22', '09:40', 0, 'normal'],
  ['farm-c', '2026-09-15', '2026-09-21', '2026-09-22', '11:25', 0, 'normal'],
  ['farm-d', '2026-09-15', '2026-09-21', '2026-09-22', '13:02', 2, 'warning'],
  ['farm-a', '2026-09-08', '2026-09-14', '2026-09-15', '09:55', 0, 'normal'],
  ['farm-b', '2026-09-08', '2026-09-14', '2026-09-15', '10:20', 0, 'normal'],
  ['farm-c', '2026-09-08', '2026-09-14', '2026-09-15', '11:02', 1, 'attention'],
  ['farm-d', '2026-09-08', '2026-09-14', '2026-09-15', '12:40', 1, 'attention'],
]

export function genericWeekly(
  farmId: string,
  weekStart: string,
  weekEnd: string,
  submittedOn: string,
  time: string,
  majorIssues: number,
  condition: Severity,
): S['WeeklyReport'] {
  const farm = farms.find((f) => f.id === farmId)!
  // Farm A has no generated production; reuse the Farm B shape scaled to 8 Ponds
  const production = generatedProduction(farmId === 'farm-a' ? 'farm-d' : farmId)!
  const ponds = production.ponds.map((p, i) => ({ ...p, pond: pondRef(farmId, i + 1) }))
  const n = ponds.length
  const feed = ponds.map((_, i) => 900 + ((i * 97) % 400))
  const mort = ponds.map((_, i) => 80 + ((i * 31) % 70))
  const totals = (unit: string, values: number[], mortality: boolean): S['WeeklyTotalByPond'] => ({
    unit,
    total: values.reduce((a, b) => a + b, 0),
    previousTotal: null,
    totalKg: mortality ? Math.round(values.reduce((a, b) => a + b, 0) * 0.013 * 10) / 10 : null,
    per10kStocked: mortality ? Math.round((values.reduce((a, b) => a + b, 0) / (n * 120_000)) * 100_000) / 10 : null,
    reducedAppetitePonds: mortality ? null : 0,
    byPond: values.map((value, i) => ({
      pond: pondRef(farmId, i + 1),
      value,
      changePct: null,
      per10kStocked: mortality ? Math.round((value / 120_000) * 100_000) / 10 : null,
      peakDate: mortality ? weekEnd : null,
      peakValue: mortality ? Math.round(value / 5) : null,
      reducedAppetiteDays: mortality ? null : 0,
    })),
  })
  const r: S['WeeklyReport'] = {
    id: `weekly-${farmId}-${weekStart}`,
    type: 'weekly',
    farm: { id: farm.id, name: farm.name },
    weekStart,
    weekEnd,
    technicalManager: TMS[farmId],
    status: 'submitted',
    issueCount: majorIssues,
    submittedAt: wib(submittedOn, time),
    dueAt: wib(submittedOn, '23:59'),
    savedAt: wib(submittedOn, time),
    previousReportId: null,
    nextReportId: null,
    docRange: { min: Math.min(...ponds.map((p) => p.doc ?? 0)) - 7, max: Math.max(...ponds.map((p) => p.doc ?? 0)) - 7 },
    summary: {
      farmCondition: condition,
      systemFarmStatus: condition,
      pondsBehind: production.kpis.growthDistribution.behind,
      pondsTotal: n,
      feedKg: feed.reduce((a, b) => a + b, 0),
      mortalityPcs: mort.reduce((a, b) => a + b, 0),
      mortalityKg: Math.round(mort.reduce((a, b) => a + b, 0) * 0.013 * 10) / 10,
      alertCount: majorIssues,
      alertsOngoing: 0,
    },
    samplingCoverage: { date: weekEnd, sampled: n, total: n, labReceived: n, notSampled: [] },
    production: { ...production, samplingDate: weekEnd, ponds },
    feeding: totals('kg', feed, false),
    mortality: totals('pcs', mort, true),
    pondsThisWeek: ponds.map((growth) => ({
      pond: growth.pond,
      growth,
      waterQuality: { doMin: 5.2, phMin: 7.7, phMax: 8.2, temperatureMax: 29.6, outOfRangeDays: 0, alertCount: 0, trend: 'stable', trendParameter: null, severity: { doMin: 'normal', ph: 'normal', temperatureMax: 'normal' } },
      laboratory: { sampledOn: weekEnd, pending: false, expectedOn: null, tan: 0.4, no2: 0.12, vibrio: 3.2, alkalinity: 135, severity: { tan: 'normal', no2: 'normal', vibrio: 'normal', alkalinity: 'normal' } },
    })),
    alerts: Array.from({ length: majorIssues }, (_, i) => ({
      id: `ALT-W${farmId.slice(-1).toUpperCase()}${weekStart.slice(8)}${i}`,
      pond: pondRef(farmId, 2 + i * 3),
      title: i === 0 ? 'DO below threshold' : 'Mortality increasing',
      parameter: i === 0 ? 'do' : 'mortality',
      severity: (i === 0 ? 'warning' : 'attention') as Severity,
      state: 'resolved' as const,
      value: null,
      thresholdValue: null,
      unit: null,
      direction: null,
      occurredAt: wib(weekStart, '05:30'),
      resolvedAt: wib(weekStart, '08:00'),
      handledBy: TMS[farmId],
      durationMinutes: 150,
      cause: null,
      action: null,
      outcome: null,
    })),
    majorActions: majorIssues ? [{ id: `wa-${farmId}-${weekStart}`, date: weekStart, pond: pondRef(farmId, 2), action: 'Additional aeration at night' }] : [],
    waterQualityComment: null,
    technicalSummary: majorIssues
      ? 'Growth mostly on target. Short DO dips before sunrise were handled with extra aeration; no lasting effect on mortality.'
      : 'A stable week. All Ponds within range and growth on target.',
  }
  r.biomassKg = production.kpis.biomassKg
  r.survivalRatePct = production.kpis.survivalRatePct
  r.pondsBehind = production.kpis.growthDistribution.behind
  r.feedKg = r.feeding.total
  r.mortalityPcs = r.mortality.total
  return r
}
