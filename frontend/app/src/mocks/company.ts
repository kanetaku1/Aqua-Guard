import type { components } from '@/api/schema'
import { NOW, farmA } from './data'

/**
 * Company-level mock (Farms Manager, FM-01 / FM-02): 4 Farms and the open Risk / Issues
 * from prototype/mock_data.md. Farm status = the most severe of Water quality / Growth / Operations (04 §7).
 */

type S = components['schemas']
const HOUR = 3_600_000
const ago = (hours: number) => new Date(Date.parse(NOW) - hours * HOUR).toISOString()

const summary = (f: S['FarmDetail']): S['FarmSummary'] => {
  const { id, name, location, pondCount, status, mainReason, waterQuality, growth, operations, openIssues } = f
  return { id, name, location, pondCount, status, mainReason, waterQuality, growth, operations, openIssues }
}

export const farms: S['FarmSummary'][] = [
  summary(farmA),
  {
    id: 'farm-b',
    name: 'Farm B',
    location: 'Lampung, Indonesia',
    pondCount: 10,
    status: 'normal',
    mainReason: 'All Ponds within range',
    waterQuality: { status: 'normal', count: 0, fact: '0 of 10 Ponds' },
    growth: { status: 'normal', count: 0, fact: 'All on target' },
    operations: { status: 'normal', count: 0, fact: 'No issues' },
    openIssues: 0,
  },
  {
    id: 'farm-c',
    name: 'Farm C',
    location: 'Banyuwangi, East Java',
    pondCount: 6,
    status: 'attention',
    mainReason: 'Pond 03 turbidity rising for 1 day',
    waterQuality: { status: 'attention', count: 1, fact: '1 of 6 Ponds' },
    growth: { status: 'normal', count: 1, fact: '1 of 6 behind' },
    operations: { status: 'normal', count: 0, fact: 'No issues' },
    openIssues: 1,
  },
  {
    id: 'farm-d',
    name: 'Farm D',
    location: 'Lombok, West Nusa Tenggara',
    pondCount: 8,
    status: 'critical',
    mainReason: 'Pond 06 DO critically low for 8 hrs; mortality rising',
    waterQuality: { status: 'critical', count: 1, fact: '1 of 8 Ponds' },
    growth: { status: 'warning', count: 4, fact: '4 of 8 behind' },
    operations: { status: 'attention', count: 2, fact: '2 devices offline' },
    openIssues: 2,
  },
]

const farmRef = (id: string) => {
  const f = farms.find((x) => x.id === id)!
  return { id: f.id, name: f.name }
}
const pondRef = (farmId: string, n: number) => ({ id: `${farmId}-pond-0${n}`, name: `Pond 0${n}` })

const issue = (
  id: string,
  farmId: string,
  n: number,
  issueType: S['Issue']['issueType'],
  parameter: string,
  trend: S['Trend'],
  severity: S['Severity'],
  since: number | string,
  handling: S['AlertState'],
): S['Issue'] => ({
  id, farm: farmRef(farmId), pond: pondRef(farmId, n), issueType, parameter, trend, severity, handling, state: 'ongoing',
  since: typeof since === 'string' ? since : ago(since), // hours ago, or the exact start (Farm A: same as its alerts)
  resolvedAt: null,
})

/** Risk / Issue (mock_data.md): live from alerts, not from reports. */
export const issues: S['Issue'][] = [
  issue('ISS-218', 'farm-a', 2, 'water_quality', 'do', 'decreasing', 'warning', '2026-09-27T00:10:00Z', 'in_progress'),
  issue('ISS-221', 'farm-a', 5, 'water_quality', 'temperature', 'increasing', 'warning', '2026-09-28T22:40:00Z', 'acknowledged'),
  issue('ISS-220', 'farm-a', 4, 'water_quality', 'ph', 'decreasing', 'attention', '2026-09-28T20:30:00Z', 'unacknowledged'),
  issue('ISS-219', 'farm-c', 3, 'water_quality', 'turbidity', 'increasing', 'attention', 24, 'acknowledged'),
  issue('ISS-214', 'farm-d', 6, 'water_quality', 'do', 'decreasing', 'critical', 8, 'in_progress'),
  issue('ISS-212', 'farm-d', 6, 'mortality', 'mortality', 'increasing', 'warning', 72, 'in_progress'),
]

const RANK = ['critical', 'warning', 'attention', 'normal']
/** Severity first, then the longest-running (OpenAPI listIssues default order). */
export const sortIssues = (list: S['Issue'][]) =>
  [...list].sort((a, b) => RANK.indexOf(a.severity) - RANK.indexOf(b.severity) || a.since.localeCompare(b.since))

export const companyProduction: S['CompanyProduction'] = {
  biomassKg: 55_600,
  survivalRatePct: 84,
  pondsBehind: 7,
  pondsTotal: 32,
  latestSamplingDate: '2026-09-28',
  previous: { biomassKg: 51_700, survivalRatePct: 85, pondsBehind: 6 },
}

// ── FM-03 Farm Detail (all 4 Farms) ──

const aspect = (status: S['Severity'], count: number, fact: string, detail: string): S['StatusAspect'] => ({ status, count, fact, detail })

const tms: Record<string, { id: string; name: string }[]> = {
  'farm-a': [{ id: 'u-sari', name: 'Sari Wijaya' }],
  'farm-b': [{ id: 'u-budi', name: 'Budi Santoso' }],
  'farm-c': [{ id: 'u-dewi', name: 'Dewi Lestari' }],
  'farm-d': [{ id: 'u-agus', name: 'Agus Pratama' }],
}
const docRanges: Record<string, { min: number; max: number }> = {
  'farm-a': { min: 34, max: 76 },
  'farm-b': { min: 30, max: 85 },
  'farm-c': { min: 28, max: 70 },
  'farm-d': { min: 25, max: 72 },
}
const details: Record<string, Pick<S['FarmSummary'], 'waterQuality' | 'growth' | 'operations'>> = {
  'farm-b': {
    waterQuality: aspect('normal', 0, '0 of 10 Ponds', 'All Ponds within range this week'),
    growth: aspect('normal', 0, 'All on target', 'All 10 Ponds on track (sampling 28 Sep)'),
    operations: aspect('normal', 0, 'No issues', 'All devices online · reports on time'),
  },
  'farm-c': {
    waterQuality: aspect('attention', 1, '1 of 6 Ponds', 'Pond 03 turbidity rising (1 day)'),
    growth: aspect('normal', 1, '1 of 6 behind', 'Pond 05 −6% (sampling 28 Sep)'),
    operations: aspect('normal', 0, 'No issues', 'All devices online · reports on time'),
  },
  'farm-d': {
    waterQuality: aspect('critical', 1, '1 of 8 Ponds', 'Pond 06 DO critically low (8 hrs)'),
    growth: aspect('warning', 4, '4 of 8 behind', 'Ponds 02, 04, 06, 07 behind target (sampling 28 Sep)'),
    operations: aspect('attention', 2, '2 devices offline', 'Pond 03 pump and Pond 06 DO sensor offline · reports on time'),
  },
}

export function farmDetail(farmId: string): S['FarmDetail'] | null {
  if (farmId === 'farm-a') return farmA
  const f = farms.find((x) => x.id === farmId)
  if (!f) return null
  return {
    ...f,
    ...details[farmId],
    technicalManagers: tms[farmId],
    docRange: docRanges[farmId],
    updatedAt: NOW,
    latestReport: null,
  }
}

/** Last 14 days of Farm status, oldest first (16–29 Sep). Farm A = prototype strip. */
const TRENDS: Record<string, string> = {
  'farm-a': 'nnnnnannnaawww',
  'farm-b': 'nnnnnnnnnnnnnn',
  'farm-c': 'nnnnnnnnnnnnaa',
  'farm-d': 'nnaaaawwwwwwcc',
}
const LEVEL: Record<string, S['Severity']> = { n: 'normal', a: 'attention', w: 'warning', c: 'critical' }
export function statusTrend(farmId: string, days: number) {
  const code = TRENDS[farmId]
  if (!code) return null
  const end = Date.parse('2026-09-29T00:00:00Z')
  return [...code].slice(-days).map((c, i, arr) => ({
    date: new Date(end - (arr.length - 1 - i) * 24 * HOUR).toISOString().slice(0, 10),
    status: LEVEL[c],
  }))
}

/** Issue details for the read-only drawer (FM-03 `?issue=`): aggregated trend in words, TM actions, report context. */
const sari = { id: 'u-sari', name: 'Sari Wijaya' }
const agus = { id: 'u-agus', name: 'Agus Pratama' }
const act = (id: string, at: string, type: S['ActionType'], note: string, by = sari): S['AlertAction'] => ({
  id,
  performedAt: at,
  type,
  note,
  recordedBy: by,
  source: 'alert_handling',
})
const ISSUE_DETAILS: Record<string, Pick<S['IssueDetail'], 'summary' | 'trendDescription' | 'handledBy' | 'actions' | 'relatedReports'>> = {
  'ISS-218': {
    summary:
      'DO in Pond 02 fell below the Warning threshold before sunrise on two consecutive days. The alert is generated from sensor data and stays open until the Technical Manager resolves it.',
    trendDescription: 'DO decreasing over 2 days, lowest before sunrise',
    handledBy: sari,
    actions: [
      act('ia-1', '2026-09-27T22:40:00Z', 'increased_aeration', 'DO back in range by 07:00'),
      act('ia-2', '2026-09-28T22:40:00Z', 'increased_aeration', 'Aerators 3 and 4 on · monitoring'),
    ],
    relatedReports: [{ id: 'daily-farm-a-2026-09-28', type: 'daily', label: 'Daily Report · 28 Sep', date: '2026-09-28' }],
  },
  'ISS-221': {
    summary: 'Water temperature in Pond 05 rose above the Warning threshold in the early morning.',
    trendDescription: 'Temperature increasing since 05:40',
    handledBy: sari,
    actions: [],
    relatedReports: [],
  },
  'ISS-220': {
    summary: 'pH in Pond 04 dropped below the Attention threshold overnight.',
    trendDescription: 'pH decreasing over 6 hours',
    handledBy: null,
    actions: [],
    relatedReports: [],
  },
  'ISS-219': {
    summary: 'Turbidity in Pond 03 has been rising for a day after rain.',
    trendDescription: 'Turbidity increasing over 1 day',
    handledBy: { id: 'u-dewi', name: 'Dewi Lestari' },
    actions: [],
    relatedReports: [],
  },
  'ISS-214': {
    summary: 'DO in Pond 06 is critically low. All aerators are running and a water exchange is being prepared.',
    trendDescription: 'DO decreasing for 8 hours',
    handledBy: agus,
    actions: [act('ia-3', ago(7), 'increased_aeration', 'All aerators on', agus)],
    relatedReports: [],
  },
  'ISS-212': {
    summary: 'Mortality in Pond 06 has risen for three days together with the low DO.',
    trendDescription: 'Mortality increasing over 3 days',
    handledBy: agus,
    actions: [act('ia-4', ago(40), 'water_treatment', 'Probiotic applied', agus)],
    relatedReports: [],
  },
}

export function issueDetail(id: string): S['IssueDetail'] | null {
  const i = issues.find((x) => x.id === id)
  return i ? { ...i, ...ISSUE_DETAILS[id] } : null
}

// ── Production per Farm (Farm A from the sampling table; B–D generated to match the Farm KPIs) ──

type FarmKpi = { biomass: number; sr: number; fcr: number; prev: { biomass: number; sr: number; fcr: number }; behind: number[] }
const FARM_KPI: Record<string, FarmKpi> = {
  'farm-b': { biomass: 22.1, sr: 89, fcr: 1.25, prev: { biomass: 20.4, sr: 90, fcr: 1.24 }, behind: [] },
  'farm-c': { biomass: 9.6, sr: 82, fcr: 1.41, prev: { biomass: 8.8, sr: 83, fcr: 1.4 }, behind: [5] },
  'farm-d': { biomass: 12.3, sr: 76, fcr: 1.55, prev: { biomass: 11.7, sr: 79, fcr: 1.51 }, behind: [2, 4, 6, 7] },
}
const CURVE: [number, number][] = [
  [27, 5.3],
  [34, 7.4],
  [41, 9.5],
  [48, 11.5],
  [55, 13.3],
  [62, 15.0],
  [69, 16.6],
  [76, 18.2],
]
const targetAt = (doc: number) => {
  let i = CURVE.findIndex(([d]) => d >= doc)
  if (i <= 0) i = i === 0 ? 1 : CURVE.length - 1
  const [d0, v0] = CURVE[i - 1]
  const [d1, v1] = CURVE[i]
  return Math.round((v0 + ((doc - d0) * (v1 - v0)) / (d1 - d0)) * 10) / 10
}

export function generatedProduction(farmId: string): S['FarmProduction'] | null {
  const k = FARM_KPI[farmId]
  const f = farms.find((x) => x.id === farmId)
  if (!k || !f) return null
  const n = f.pondCount
  const { min, max } = docRanges[farmId]
  const ponds: S['PondProduction'][] = Array.from({ length: n }, (_, i) => {
    const no = i + 1
    const id = String(no).padStart(2, '0')
    const doc = Math.round(max - ((max - min) * i) / Math.max(1, n - 1))
    const target = targetAt(doc)
    const pct = k.behind.includes(no) ? -6 - (no % 3) : (no % 5) - 2
    const abw = Math.round(target * (1 + pct / 100) * 10) / 10
    return {
      pond: { id: `${farmId}-pond-${id}`, name: `Pond ${id}` },
      areaHa: 0.4,
      stockedOn: new Date(Date.parse('2026-09-29T00:00:00Z') - doc * 24 * HOUR).toISOString().slice(0, 10),
      stockedPl: 120_000,
      doc,
      abwG: abw,
      targetAbwG: target,
      vsTargetPct: pct,
      growth: pct <= -5 ? 'behind' : pct >= 5 ? 'ahead' : 'on_track',
      adgGPerDay: Math.round((0.2 + (no % 4) * 0.02) * 100) / 100,
      survivalRatePct: k.sr + ((no % 3) - 1),
      fcr: Math.round((k.fcr + ((no % 3) - 1) * 0.03) * 100) / 100,
      biomassKg: 0,
      sizeUniformityPct: 80 + (no % 5),
    }
  })
  // Split the Farm biomass by ABW so the Pond values add up to the Farm total
  const weight = ponds.reduce((s, p) => s + (p.abwG ?? 0), 0)
  ponds.forEach((p) => (p.biomassKg = Math.round((k.biomass * 1000 * (p.abwG ?? 0)) / weight / 10) * 10))
  return {
    samplingDate: '2026-09-28',
    kpis: {
      biomassKg: k.biomass * 1000,
      survivalRatePct: k.sr,
      fcr: k.fcr,
      growthDistribution: {
        behind: ponds.filter((p) => p.growth === 'behind').length,
        onTrack: ponds.filter((p) => p.growth === 'on_track').length,
        ahead: ponds.filter((p) => p.growth === 'ahead').length,
      },
      previous: { biomassKg: k.prev.biomass * 1000, survivalRatePct: k.prev.sr, fcr: k.prev.fcr },
    },
    ponds,
    growthCurve: CURVE.map(([doc, targetAbwG]) => ({ doc, targetAbwG })),
  }
}
