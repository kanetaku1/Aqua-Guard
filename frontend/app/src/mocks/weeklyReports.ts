import type { components } from '@/api/schema'
import type { Severity } from '@/api/types'
import { NOW, farmAPonds, growthCurve } from './data'
import { OTHER_WEEKLY, genericWeekly } from './fmReports'

/**
 * Weekly Reports of Farm A (mock backend, TM-05 / FM-06). Aggregates (production, weekly totals, water quality
 * trends) are backend work; the mock returns the values of prototype/mock_data.md and tm-weekly-report.html.
 */

type S = components['schemas']
type WeeklyReport = S['WeeklyReport']
type PondProduction = S['PondProduction']

const FARM = { id: 'farm-a', name: 'Farm A' }
const SARI = { id: 'u-sari', name: 'Sari Wijaya' }
const pond = (n: number) => farmAPonds.find((p) => p.pond.id === `farm-a-pond-0${n}`)!.pond
const STOCKED = [120_000, 150_000, 120_000, 120_000, 150_000, 120_000, 120_000, 120_000]
const wib = (date: string, time: string) => new Date(`${date}T${time}:00+07:00`).toISOString()
const judge = (pct: number): S['GrowthJudgement'] => (pct <= -5 ? 'behind' : pct >= 5 ? 'ahead' : 'on_track')

/** Pond Production Summary rows: [n, DOC, ABW, target, vs%, ADG, SR, FCR, biomass t, uniformity] (mock_data.md). */
type ProdRow = [number, number, number, number, number, number | null, number, number, number, number]
const PROD_28: ProdRow[] = [
  [1, 76, 18.0, 18.2, -1, 0.21, 88, 1.38, 1.9, 81],
  [2, 62, 13.8, 15.0, -8, 0.21, 84, 1.41, 1.74, 75],
  [3, 69, 16.9, 16.6, 2, 0.23, 89, 1.29, 1.8, 82],
  [4, 55, 12.9, 13.3, -3, 0.23, 87, 1.3, 1.35, 79],
  [5, 62, 13.9, 15.0, -7, 0.21, 82, 1.44, 1.71, 74],
  [6, 48, 11.8, 11.5, 3, 0.27, 90, 1.21, 1.27, 83],
  [7, 41, 9.4, 9.5, -1, 0.26, 91, 1.15, 1.03, 85],
  [8, 34, 7.6, 7.4, 3, 0.3, 92, 1.1, 0.84, 84],
]
const PROD_21: ProdRow[] = [
  [1, 69, 16.5, 16.6, -1, 0.23, 89, 1.36, 1.76, 80],
  [2, 55, 12.3, 13.3, -8, 0.23, 85, 1.38, 1.57, 76],
  [3, 62, 15.3, 15.0, 2, 0.22, 90, 1.27, 1.65, 82],
  [4, 48, 11.3, 11.5, -2, 0.23, 88, 1.28, 1.19, 79],
  [5, 55, 12.4, 13.3, -7, 0.23, 83, 1.42, 1.54, 74],
  [6, 41, 9.9, 9.5, 4, 0.27, 91, 1.19, 1.08, 83],
  [7, 34, 7.6, 7.4, 3, 0.29, 92, 1.13, 0.84, 85],
  [8, 27, 5.5, 5.3, 4, null, 93, 1.08, 0.61, 84],
]

const STOCKED_ON = ['2026-07-15', '2026-07-29', '2026-07-22', '2026-08-05', '2026-07-29', '2026-08-12', '2026-08-19', '2026-08-26']
const AREA = [0.4, 0.5, 0.4, 0.4, 0.5, 0.4, 0.4, 0.4]

const production = (
  samplingDate: string,
  rows: ProdRow[],
  kpis: { biomass: number; sr: number; fcr: number },
  previous: { biomass: number; sr: number; fcr: number } | null,
): S['FarmProduction'] => {
  const ponds: PondProduction[] = rows.map(([n, doc, abw, target, pct, adg, sr, fcr, biomass, uni]) => ({
    pond: pond(n),
    areaHa: AREA[n - 1],
    stockedOn: STOCKED_ON[n - 1],
    stockedPl: STOCKED[n - 1],
    doc,
    abwG: abw,
    targetAbwG: target,
    vsTargetPct: pct,
    growth: judge(pct),
    adgGPerDay: adg,
    survivalRatePct: sr,
    fcr,
    biomassKg: Math.round(biomass * 1000),
    sizeUniformityPct: uni,
  }))
  return {
    samplingDate,
    kpis: {
      biomassKg: kpis.biomass * 1000,
      survivalRatePct: kpis.sr,
      fcr: kpis.fcr,
      growthDistribution: {
        behind: ponds.filter((p) => p.growth === 'behind').length,
        onTrack: ponds.filter((p) => p.growth === 'on_track').length,
        ahead: ponds.filter((p) => p.growth === 'ahead').length,
      },
      previous: previous ? { biomassKg: previous.biomass * 1000, survivalRatePct: previous.sr, fcr: previous.fcr } : undefined,
    },
    ponds,
    growthCurve,
  }
}

/** Farm A production on the latest sampling (FM-03). */
export const farmAProduction = () => production('2026-09-28', PROD_28, { biomass: 11.6, sr: 88, fcr: 1.31 }, { biomass: 10.2, sr: 89, fcr: 1.29 })

const change = (now: number, prev: number) => Math.round((now / prev - 1) * 100)

function totals(
  unit: string,
  values: number[],
  previous: number[] | null,
  extra: { peaks?: [string, number][]; reduced?: number[]; totalKg?: number },
): S['WeeklyTotalByPond'] {
  const total = values.reduce((a, b) => a + b, 0)
  const mortality = !!extra.peaks
  return {
    unit,
    total,
    previousTotal: previous ? previous.reduce((a, b) => a + b, 0) : null,
    totalKg: extra.totalKg ?? null,
    per10kStocked: mortality ? Math.round((total / STOCKED.reduce((a, b) => a + b, 0)) * 100_000) / 10 : null,
    reducedAppetitePonds: extra.reduced ? extra.reduced.filter((d) => d > 0).length : null,
    byPond: values.map((value, i) => ({
      pond: pond(i + 1),
      value,
      changePct: previous ? change(value, previous[i]) : null,
      per10kStocked: mortality ? Math.round((value / STOCKED[i]) * 100_000) / 10 : null,
      peakDate: extra.peaks?.[i][0] ?? null,
      peakValue: extra.peaks?.[i][1] ?? null,
      reducedAppetiteDays: extra.reduced?.[i] ?? null,
    })),
  }
}

type WqRow = [number | null, number, number, number, number, number, S['Trend'], S['SensorParameter'] | null, Severity, Severity, Severity]
const WQ_22_28: WqRow[] = [
  [5.1, 7.7, 8.2, 29.8, 0, 0, 'stable', null, 'normal', 'normal', 'normal'],
  [4.3, 7.6, 8.1, 29.9, 7, 4, 'decreasing', 'do', 'warning', 'normal', 'normal'],
  [5.4, 7.8, 8.2, 29.5, 0, 0, 'stable', null, 'normal', 'normal', 'normal'],
  [5.0, 7.4, 8.0, 29.6, 1, 1, 'decreasing', 'ph', 'normal', 'attention', 'normal'],
  [4.9, 7.7, 8.1, 30.8, 4, 2, 'increasing', 'temperature', 'attention', 'normal', 'attention'],
  [5.4, 7.9, 8.3, 29.3, 0, 0, 'stable', null, 'normal', 'normal', 'normal'],
  [5.3, 7.8, 8.2, 29.4, 0, 0, 'stable', null, 'normal', 'normal', 'normal'],
  [5.2, 7.8, 8.1, 29.5, 0, 1, 'stable', null, 'normal', 'normal', 'normal'],
]

/** Lab values [TAN, NO2, Vibrio, Alk] (mock_data.md "Laboratory per Pond"); null = pending. */
const LAB_28: ([number, number, number, number] | null)[] = [
  [0.4, 0.12, 3.5, 135],
  [0.8, 0.22, 7.2, 128],
  [0.4, 0.1, 3.0, 138],
  [0.5, 0.14, 4.4, 118],
  [0.6, 0.17, 6.8, 130],
  [0.3, 0.09, 2.5, 140],
  [0.3, 0.11, 3.2, 137],
  null,
]
const LAB_21: ([number, number, number, number] | null)[] = [
  [0.3, 0.1, 3.1, 138],
  [0.6, 0.18, 6.2, 130],
  [0.3, 0.09, 2.8, 140],
  [0.4, 0.12, 4.0, 126],
  [0.5, 0.15, 8.5, 132],
  [0.2, 0.08, 2.2, 142],
  [0.3, 0.1, 3.0, 139],
  [0.3, 0.11, 2.6, 137],
]
const labSeverity = (v: [number, number, number, number]) => ({
  tan: v[0] > 1 ? 'attention' : 'normal',
  no2: v[1] > 0.5 ? 'attention' : 'normal',
  vibrio: v[2] >= 10 ? 'warning' : v[2] >= 5 ? 'attention' : 'normal',
  alkalinity: v[3] < 80 || v[3] > 180 ? 'warning' : v[3] < 100 || v[3] > 150 ? 'attention' : 'normal',
}) as const

function pondsThisWeek(prod: S['FarmProduction'], wq: WqRow[], lab: typeof LAB_28, sampledOn: string): S['WeeklyPondRow'][] {
  return prod.ponds.map((growth, i) => {
    const [doMin, phMin, phMax, temperatureMax, outOfRangeDays, alertCount, trend, trendParameter, sDo, sPh, sTemp] = wq[i]
    const l = lab[i]
    return {
      pond: growth.pond,
      growth,
      waterQuality: { doMin, phMin, phMax, temperatureMax, outOfRangeDays, alertCount, trend, trendParameter, severity: { doMin: sDo, ph: sPh, temperatureMax: sTemp } },
      laboratory: l
        ? { sampledOn, pending: false, expectedOn: null, tan: l[0], no2: l[1], vibrio: l[2], alkalinity: l[3], severity: labSeverity(l) }
        : { sampledOn, pending: true, expectedOn: '2026-09-30', tan: null, no2: null, vibrio: null, alkalinity: null, severity: {} },
    }
  })
}

const weekAlert = (
  id: string,
  n: number,
  title: string,
  parameter: string,
  severity: Severity,
  state: S['AlertState'],
  occurredAt: string,
  resolvedAt: string | null,
  durationMinutes: number,
): WeeklyReport['alerts'][number] => ({
  id,
  pond: pond(n),
  title,
  parameter,
  severity,
  state,
  value: null,
  thresholdValue: null,
  unit: null,
  direction: null,
  occurredAt,
  resolvedAt,
  handledBy: SARI,
  durationMinutes,
  cause: null,
  action: null,
  outcome: null,
})

function base(
  id: string,
  weekStart: string,
  weekEnd: string,
  status: 'draft' | 'submitted',
  savedAt: string,
  submittedAt: string | null,
  dueAt: string,
  rest: Omit<WeeklyReport, 'id' | 'type' | 'farm' | 'weekStart' | 'weekEnd' | 'technicalManager' | 'status' | 'submittedAt' | 'dueAt' | 'savedAt' | 'previousReportId' | 'nextReportId'>,
): WeeklyReport {
  const r: WeeklyReport = {
    id,
    type: 'weekly',
    farm: FARM,
    weekStart,
    weekEnd,
    technicalManager: SARI,
    status,
    submittedAt,
    dueAt,
    savedAt,
    issueCount: rest.alerts.length,
    previousReportId: null,
    nextReportId: null,
    ...rest,
  }
  r.biomassKg = r.production.kpis.biomassKg
  r.survivalRatePct = r.production.kpis.survivalRatePct
  r.pondsBehind = r.production.kpis.growthDistribution.behind
  r.feedKg = r.feeding.total
  r.mortalityPcs = r.mortality.total
  return r
}

const FEED_22 = [1318, 1059, 1249, 973, 1162, 1042, 973, 834]
const FEED_15 = [1291, 1035, 1222, 951, 1136, 1019, 951, 815]
const MORT_22 = [107, 241, 95, 123, 179, 85, 102, 104]
const MORT_15 = [101, 191, 89, 113, 308, 97, 115, 106]

function seed(): Map<string, WeeklyReport> {
  const prod28 = production('2026-09-28', PROD_28, { biomass: 11.6, sr: 88, fcr: 1.31 }, { biomass: 10.2, sr: 89, fcr: 1.29 })
  const prod21 = production('2026-09-21', PROD_21, { biomass: 10.2, sr: 89, fcr: 1.29 }, { biomass: 8.9, sr: 90, fcr: 1.27 })

  const draft = base('weekly-farm-a-2026-09-22', '2026-09-22', '2026-09-28', 'draft', '2026-09-28T13:15:00Z', null, '2026-09-29T16:59:00Z', {
    docRange: { min: 34, max: 76 },
    summary: { farmCondition: 'warning', systemFarmStatus: 'warning', pondsBehind: 2, pondsTotal: 8, feedKg: 8610, mortalityPcs: 1036, mortalityKg: 13.2, alertCount: 4, alertsOngoing: 2 },
    samplingCoverage: { date: '2026-09-28', sampled: 8, total: 8, labReceived: 7, notSampled: [] },
    production: prod28,
    feeding: totals('kg', FEED_22, FEED_15, { reduced: [0, 4, 0, 0, 3, 0, 0, 0] }),
    mortality: totals('pcs', MORT_22, MORT_15, {
      totalKg: 13.2,
      peaks: [
        ['2026-09-27', 18],
        ['2026-09-28', 64],
        ['2026-09-26', 16],
        ['2026-09-28', 22],
        ['2026-09-28', 31],
        ['2026-09-26', 14],
        ['2026-09-26', 17],
        ['2026-09-26', 18],
      ],
    }),
    pondsThisWeek: pondsThisWeek(prod28, WQ_22_28, LAB_28, '2026-09-28'),
    alerts: [
      { ...weekAlert('ALT-1033', 2, 'DO below threshold', 'do', 'warning', 'in_progress', wib('2026-09-27', '07:10'), null, 2 * 24 * 60), cause: 'Low wind, high biomass', action: 'aeration + feed −10%', outcome: null },
      weekAlert('ALT-1027', 5, 'Temperature above threshold', 'temperature', 'warning', 'resolved', wib('2026-09-25', '13:20'), wib('2026-09-25', '14:20'), 60),
      weekAlert('ALT-1038', 4, 'pH below threshold', 'ph', 'attention', 'resolved', wib('2026-09-28', '03:30'), wib('2026-09-28', '04:10'), 40),
      weekAlert('ALT-1035', 8, 'Turbidity sensor offline', 'sensor_offline', 'attention', 'acknowledged', wib('2026-09-28', '22:10'), null, 85),
    ],
    majorActions: [
      { id: 'wa-1', date: '2026-09-27', pond: pond(2), action: 'Additional aeration, feed reduced 10%' },
      { id: 'wa-2', date: '2026-09-28', pond: pond(8), action: 'Turbidity sensor replacement requested' },
    ],
    waterQualityComment: null,
    technicalSummary: null,
  })

  const s15 = base('weekly-farm-a-2026-09-15', '2026-09-15', '2026-09-21', 'submitted', wib('2026-09-22', '10:10'), wib('2026-09-22', '10:10'), '2026-09-22T16:59:00Z', {
    docRange: { min: 27, max: 69 },
    summary: { farmCondition: 'normal', systemFarmStatus: 'normal', pondsBehind: 2, pondsTotal: 8, feedKg: 8420, mortalityPcs: 1120, mortalityKg: 14.3, alertCount: 3, alertsOngoing: 0 },
    samplingCoverage: { date: '2026-09-21', sampled: 8, total: 8, labReceived: 8, notSampled: [] },
    production: prod21,
    // Previous week (8–14 Sep) about 6% less feed → "8,420 kg (+6%)"
    feeding: totals('kg', FEED_15, FEED_15.map((v) => Math.round(v / 1.06)), { reduced: [0, 2, 0, 0, 1, 0, 0, 0] }),
    mortality: totals('pcs', MORT_15, null, {
      totalKg: 14.3,
      peaks: [
        ['2026-09-19', 17],
        ['2026-09-20', 34],
        ['2026-09-17', 15],
        ['2026-09-19', 19],
        ['2026-09-18', 96],
        ['2026-09-16', 16],
        ['2026-09-18', 19],
        ['2026-09-20', 18],
      ],
    }),
    pondsThisWeek: pondsThisWeek(prod21, WQ_22_28.map((w) => [...w.slice(0, 4), 0, 0, 'stable', null, 'normal', 'normal', 'normal'] as WqRow), LAB_21, '2026-09-21'),
    alerts: [
      { ...weekAlert('ALT-1019', 5, 'Temperature above threshold', 'temperature', 'warning', 'resolved', wib('2026-09-18', '11:40'), wib('2026-09-19', '13:40'), 26 * 60), cause: 'Hot spell', action: 'water exchange 15%', outcome: 'back in range 19 Sep' },
      { ...weekAlert('ALT-1016', 2, 'DO below threshold', 'do', 'warning', 'resolved', wib('2026-09-17', '05:10'), wib('2026-09-17', '05:38'), 28), cause: 'Low wind before sunrise', action: 'aeration increased', outcome: 'recovered' },
      weekAlert('ALT-1021', 2, 'DO below threshold', 'do', 'attention', 'resolved', wib('2026-09-20', '04:50'), wib('2026-09-20', '05:35'), 45),
    ],
    majorActions: [
      { id: 'wa-s1', date: '2026-09-18', pond: pond(5), action: 'water exchange 15% to reduce temperature' },
      { id: 'wa-s2', date: '2026-09-19', pond: null, action: 'Probiotic application in Ponds 02 and 05' },
      { id: 'wa-s3', date: '2026-09-21', pond: null, action: 'Feed size changed to Grower 2 in Ponds 01–05' },
    ],
    waterQualityComment: 'Stable overall; Pond 05 temperature peaked during the heat on 18 Sep.',
    technicalSummary:
      '6 of 8 Ponds are on the growth target; Ponds 02 and 05 (both DOC 55) are 7–8% below. Mortality was concentrated in Pond 05 during the high-temperature period on 18–19 Sep and returned to normal after water exchange. Vibrio is above 5 × 10³ CFU/mL in Pond 05 and close in Pond 02; probiotic application continues.',
  })

  const map = new Map([
    [draft.id, draft],
    [s15.id, s15],
  ])
  for (const args of OTHER_WEEKLY) {
    const r = genericWeekly(...args)
    map.set(r.id, r)
  }
  return map
}

export let weeklyReports = seed()
export function resetWeeklyReports() {
  weeklyReports = seed()
}

/** Newest week first, then by Farm. */
const sorted = () =>
  [...weeklyReports.values()].sort((a, b) => (b.weekStart ?? '').localeCompare(a.weekStart ?? '') || a.farm.name.localeCompare(b.farm.name))

export function getWeekly(id: string): WeeklyReport | null {
  const r = weeklyReports.get(id)
  if (!r) return null
  const list = sorted().filter((x) => x.farm.id === r.farm.id)
  const i = list.findIndex((x) => x.id === id)
  return { ...r, previousReportId: list[i + 1]?.id ?? null, nextReportId: list[i - 1]?.id ?? null }
}

export const listWeekly = () => sorted()

export function saveWeekly(id: string, body: S['WeeklyReportInput']): WeeklyReport | 'submitted' | null {
  const r = weeklyReports.get(id)
  if (!r) return null
  if (r.status === 'submitted') return 'submitted'
  if (body.farmCondition) r.summary.farmCondition = body.farmCondition
  for (const note of body.alertNotes ?? []) {
    const a = r.alerts.find((x) => x.id === note.alertId)
    if (a) Object.assign(a, { cause: note.cause ?? null, action: note.action ?? null, outcome: note.outcome ?? null })
  }
  if (body.majorActions) {
    r.majorActions = body.majorActions.map((a, i) => ({ id: a.id ?? `wa-new-${i}-${Date.now()}`, date: a.date, pond: a.pondId ? pond(Number(a.pondId.slice(-1))) : null, action: a.action }))
  }
  if (body.waterQualityComment !== undefined) r.waterQualityComment = body.waterQualityComment
  if (body.technicalSummary !== undefined) r.technicalSummary = body.technicalSummary
  r.savedAt = NOW
  return getWeekly(id)
}

export function submitWeekly(id: string): WeeklyReport | 'submitted' | 'missing' | null {
  const r = weeklyReports.get(id)
  if (!r) return null
  if (r.status === 'submitted') return 'submitted'
  if (!r.technicalSummary?.trim()) return 'missing'
  Object.assign(r, { status: 'submitted', submittedAt: NOW, savedAt: NOW })
  return getWeekly(id)
}

/** TM-01 Report Status (weekly) from the live store. */
export function weeklyStatus(weekStart: string): S['ReportStatusItem'] {
  const r = [...weeklyReports.values()].find((x) => x.farm.id === 'farm-a' && x.weekStart === weekStart)
  return {
    reportId: r?.id ?? null,
    state: r ? r.status : 'not_started',
    weekStart,
    weekEnd: r?.weekEnd,
    dueAt: r?.dueAt ?? '2026-09-29T16:59:00Z',
    savedAt: r?.savedAt ?? null,
  }
}
