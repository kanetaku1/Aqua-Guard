import type { components } from '@/api/schema'
import type { Severity } from '@/api/types'
import { NOW, farmA, farmAAlerts, farmAPonds } from './data'
import { SCHEDULE, store } from './pondDetail'
import { OTHER_DAILY, genericDaily } from './fmReports'

/**
 * Daily Reports of Farm A (mock backend, TM-04 / FM-05). The draft for today is rebuilt from the records
 * every time it is read; submitted reports are frozen snapshots (05 §5 TM-04, 04 §4.1).
 * Values for 28 Sep come from prototype/mock_data.md "Daily Report 28 Sep".
 */

type S = components['schemas']
type DailyReport = S['DailyReport']
type PondInput = Pick<S['DailyPondRow'], 'appetite' | 'tray' | 'mortalityNote' | 'health' | 'observations' | 'healthNote'>
type ManualAction = { id: string; at: string; pondId: string | null; action: string; outcome: string | null }
type ManualEvent = { id: string; equipment: string; pondId: string | null; failure: string; occurredAt: string; action: string | null; status: 'in_progress' | 'resolved' }

export type DraftInputs = {
  ponds: Record<string, PondInput>
  environment: DailyReport['environment']
  excludedAlertIds: string[]
  manualActions: ManualAction[]
  manualEquipmentEvents: ManualEvent[]
  summary: string | null
}

type StoredReport = {
  id: string
  farmId: string
  date: string
  status: 'draft' | 'submitted'
  savedAt: string | null
  submittedAt: string | null
  inputs: DraftInputs
  snapshot: DailyReport | null
}

const FARM = { id: 'farm-a', name: 'Farm A' }
const SARI = { id: 'u-sari', name: 'Sari Wijaya' }
const pondRef = (pondId: string) => farmAPonds.find((p) => p.pond.id === pondId)!.pond
const pondN = (n: number) => `farm-a-pond-0${n}`
const MIN = 60_000

/** WIB day → [start, end) in ms. */
export const dayRange = (date: string): [number, number] => {
  const start = Date.parse(`${date}T00:00:00+07:00`)
  return [start, start + 24 * 60 * MIN]
}
const dueAt = (date: string) => new Date(`${date}T18:00:00+07:00`).toISOString()
const wib = (date: string, time: string) => new Date(`${date}T${time}:00+07:00`).toISOString()

const defaultPond = (): PondInput => ({ appetite: 'good', tray: 'clean', mortalityNote: null, health: 'normal', observations: [], healthNote: null })

// ── Build a report from records + inputs ──

function alertsOn(date: string, excluded: string[]): DailyReport['alerts'] {
  const [start, end] = dayRange(date)
  const nowMs = Date.parse(NOW)
  return farmAAlerts
    .filter((a) => Date.parse(a.occurredAt) < end && (a.resolvedAt === null || Date.parse(a.resolvedAt) >= start))
    .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt))
    .map(({ sensor: _s, issueId: _i, acknowledgedAt: _a, acknowledgedBy: _b, actions: _c, ...alert }) => ({
      ...alert,
      durationMinutes: Math.round(((alert.resolvedAt ? Date.parse(alert.resolvedAt) : Math.min(nowMs, end)) - Date.parse(alert.occurredAt)) / MIN),
      excluded: excluded.includes(alert.id),
    }))
}

function actionsOn(date: string, manual: ManualAction[]): S['ReportAction'][] {
  const [start, end] = dayRange(date)
  const inDay = (iso: string) => Date.parse(iso) >= start && Date.parse(iso) < end
  const rows: S['ReportAction'][] = []

  // Actuator operations by the TM (grouped when several machines were switched at once)
  const ops = store.actuatorLogs.filter((l) => l.by && l.result === 'succeeded' && inDay(l.at))
  const groups = new Map<string, typeof ops>()
  for (const l of ops) {
    const key = `${l.at}|${l.actuatorId.slice(0, 5)}|${l.command}|${l.mode}`
    groups.set(key, [...(groups.get(key) ?? []), l])
  }
  for (const [key, logs] of groups) {
    const first = logs[0]
    const names = logs.map((l) => l.actuatorName).sort()
    const verb = { turn_on: 'on', turn_off: 'off', set_manual: 'switched to Manual', set_auto: 'returned to Auto' }[first.command] ?? first.command
    const override = first.mode === 'manual_override' ? ' (manual override)' : ''
    // "Increased aeration — aerators 3 and 4 on (manual override)" (wireframe)
    const aerators = names.every((n) => n.startsWith('Aerator '))
    const what = aerators
      ? `${names.length > 1 ? 'aerators' : 'aerator'} ${names.map((n) => n.slice(8)).join(' and ')}`
      : names.join(' and ')
    const lead = aerators && first.command === 'turn_on' ? 'Increased aeration — ' : aerators && first.command === 'turn_off' ? 'Reduced aeration — ' : ''
    rows.push({
      id: `log-${key}`,
      source: 'actuator_log',
      at: first.at,
      pond: pondRef(`farm-a-pond-${first.actuatorId.slice(3, 5)}`),
      action: lead ? `${lead}${what} ${verb}${override}` : `${what.charAt(0).toUpperCase()}${what.slice(1)} ${verb}${override}`,
      outcome: null,
    })
  }

  // Actions recorded while handling alerts
  for (const a of farmAAlerts) {
    for (const act of a.actions) {
      if (act.source !== 'alert_handling' || !inDay(act.performedAt)) continue
      const type = act.type.replace(/_/g, ' ')
      rows.push({
        id: act.id,
        source: 'alert_handling',
        at: act.performedAt,
        pond: a.pond,
        action: `${type.charAt(0).toUpperCase()}${type.slice(1)}${act.note ? ` — ${act.note}` : ''}`,
        outcome: null,
      })
    }
  }

  for (const m of manual) {
    rows.push({ id: m.id, source: 'manual', at: m.at, pond: m.pondId ? pondRef(m.pondId) : null, action: m.action, outcome: m.outcome })
  }
  return rows.sort((a, b) => a.at.localeCompare(b.at))
}

function pondRows(date: string, inputs: DraftInputs): S['DailyPondRow'][] {
  return farmAPonds.map((row) => {
    const feeds = store.feedings.filter((f) => f.pondId === row.pond.id && f.date === date)
    const deaths = store.mortalities.filter((m) => m.pondId === row.pond.id && m.date === date)
    const aerators = store.actuators.filter((a) => a.type === 'aerator' && a.id.startsWith(`A-P${row.pond.id.slice(-2)}-`))
    return {
      pond: row.pond,
      feedKg: feeds.reduce((s, f) => s + f.amountKg, 0),
      feedRounds: feeds.length,
      feedRoundsPlanned: SCHEDULE.length,
      feedType: feeds.sort((a, b) => b.round - a.round)[0]?.feedType.replace(/ \(.*\)$/, '') ?? null,
      mortalityPcs: deaths.reduce((s, m) => s + m.count, 0),
      mortalityKg: Math.round(deaths.reduce((s, m) => s + m.weightKg, 0) * 100) / 100,
      aerators: { on: aerators.filter((a) => a.state === 'on').length, total: aerators.length },
      ...(inputs.ponds[row.pond.id] ?? defaultPond()),
    }
  })
}

function totalsOf(ponds: S['DailyPondRow'][]): DailyReport['totals'] {
  return {
    feedKg: ponds.reduce((s, p) => s + p.feedKg, 0),
    mortalityPcs: ponds.reduce((s, p) => s + p.mortalityPcs, 0),
    mortalityKg: Math.round(ponds.reduce((s, p) => s + p.mortalityKg, 0) * 100) / 100,
    reducedAppetitePonds: ponds.filter((p) => p.appetite !== 'good').length,
    leftoverTrayPonds: ponds.filter((p) => p.tray !== 'clean').length,
    healthNotedPonds: ponds.filter((p) => p.health !== 'normal').length,
  }
}

/** Ponds needing attention (04 §7): health noted or an included alert, sensor offline included. */
function attentionCount(r: DailyReport): number {
  const ids = new Set(r.ponds.filter((p) => p.health !== 'normal').map((p) => p.pond.id))
  r.alerts.filter((a) => !a.excluded).forEach((a) => ids.add(a.pond.id))
  return ids.size
}

function build(rec: StoredReport): DailyReport {
  if (rec.snapshot) return { ...rec.snapshot, ...neighbours(rec) }
  const ponds = pondRows(rec.date, rec.inputs)
  const report: DailyReport = {
    id: rec.id,
    type: 'daily',
    farm: FARM,
    date: rec.date,
    technicalManager: SARI,
    status: rec.status,
    issueCount: 0,
    submittedAt: rec.submittedAt,
    dueAt: dueAt(rec.date),
    savedAt: rec.savedAt,
    ponds,
    totals: totalsOf(ponds),
    environment: rec.inputs.environment,
    equipmentEvents: rec.inputs.manualEquipmentEvents.map(({ pondId, ...e }) => ({ ...e, source: 'manual' as const, pond: pondId ? pondRef(pondId) : null })),
    alerts: alertsOn(rec.date, rec.inputs.excludedAlertIds),
    actions: actionsOn(rec.date, rec.inputs.manualActions),
    summary: rec.inputs.summary,
    farmStatus: farmA.status,
    ...neighbours(rec),
  }
  report.issueCount = report.alerts.filter((a) => !a.excluded).length
  report.pondsNeedingAttention = attentionCount(report)
  report.feedKg = report.totals.feedKg
  report.mortalityPcs = report.totals.mortalityPcs
  return report
}

/** Previous / next report of the same Farm. */
function neighbours(rec: StoredReport) {
  const same = [...reports.values()].filter((r) => r.farmId === rec.farmId).sort((a, b) => a.date.localeCompare(b.date))
  const i = same.findIndex((r) => r.id === rec.id)
  const prev = same[i - 1]
  const next = same[i + 1]
  return { previousReportId: prev?.id ?? null, nextReportId: next?.id ?? null, previousReportDate: prev?.date ?? null, nextReportDate: next?.date ?? null }
}

// ── Seed ──

function snapshot(
  date: string,
  submittedAt: string,
  rows: [number, number, string, S['Appetite'], S['TrayCondition'], number, number, Severity, S['HealthObservation'][], string | null][],
  extra: Pick<DailyReport, 'environment' | 'equipmentEvents' | 'alerts' | 'actions' | 'summary' | 'farmStatus'>,
): DailyReport {
  const ponds: S['DailyPondRow'][] = rows.map(([n, feed, type, appetite, tray, pcs, kg, health, observations, note]) => ({
    pond: pondRef(pondN(n)),
    feedKg: feed,
    feedRounds: 4,
    feedRoundsPlanned: 4,
    feedType: type,
    appetite,
    tray,
    mortalityPcs: pcs,
    mortalityKg: kg,
    mortalityNote: null,
    health,
    observations,
    healthNote: note,
    aerators: n === 2 || n === 5 ? { on: 4, total: 4 } : { on: 2, total: 2 },
  }))
  const r: DailyReport = {
    id: `daily-farm-a-${date}`,
    type: 'daily',
    farm: FARM,
    date,
    technicalManager: SARI,
    status: 'submitted',
    issueCount: extra.alerts.filter((a) => !a.excluded).length,
    submittedAt,
    dueAt: dueAt(date),
    savedAt: submittedAt,
    ponds,
    totals: totalsOf(ponds),
    previousReportId: null,
    nextReportId: null,
    previousReportDate: null,
    nextReportDate: null,
    ...extra,
  }
  r.pondsNeedingAttention = attentionCount(r)
  r.feedKg = r.totals.feedKg
  r.mortalityPcs = r.totals.mortalityPcs
  return r
}

const pastAlert = (
  id: string,
  n: number,
  title: string,
  parameter: string,
  severity: Severity,
  occurredAt: string,
  resolvedAt: string | null,
  durationMinutes: number,
): DailyReport['alerts'][number] => ({
  id,
  pond: pondRef(pondN(n)),
  title,
  parameter,
  severity,
  state: resolvedAt ? 'resolved' : 'acknowledged',
  value: null,
  thresholdValue: null,
  unit: null,
  direction: null,
  occurredAt,
  resolvedAt,
  handledBy: SARI,
  durationMinutes,
  excluded: false,
})

function seed(): Map<string, StoredReport> {
  const empty: DraftInputs = { ponds: {}, environment: { weather: null, rainfallMm: null, events: null }, excludedAlertIds: [], manualActions: [], manualEquipmentEvents: [], summary: null }
  const s27 = snapshot(
    '2026-09-27',
    wib('2026-09-27', '18:05'),
    [
      [1, 191, 'Grower 2', 'good', 'clean', 17, 0.22, 'normal', [], null],
      [2, 153, 'Grower 2', 'reduced', 'leftover', 41, 0.52, 'attention', ['reduced_appetite'], 'Low DO before dawn'],
      [3, 181, 'Grower 2', 'good', 'clean', 15, 0.2, 'normal', [], null],
      [4, 141, 'Grower 2', 'good', 'clean', 21, 0.27, 'normal', [], null],
      [5, 168, 'Grower 2', 'good', 'clean', 30, 0.39, 'normal', [], null],
      [6, 151, 'Grower 1', 'good', 'clean', 14, 0.18, 'normal', [], null],
      [7, 140, 'Grower 1', 'good', 'clean', 17, 0.21, 'normal', [], null],
      [8, 120, 'Grower 1', 'good', 'clean', 15, 0.19, 'normal', [], null],
    ],
    {
      farmStatus: 'attention',
      environment: { weather: 'sunny', rainfallMm: 0, events: null },
      equipmentEvents: [],
      alerts: [pastAlert('ALT-1030', 2, 'DO below threshold (4.3 mg/L < 4.5)', 'do', 'warning', '2026-09-26T22:15:00Z', '2026-09-27T00:05:00Z', 110)],
      actions: [
        { id: 'r27-1', source: 'alert_handling', at: '2026-09-26T22:30:00Z', pond: pondRef(pondN(2)), action: 'Increased aeration — all aerators on until 07:00', outcome: 'DO back above 5.0 mg/L by 07:05' },
      ],
      summary: 'Sunny and calm. Pond 02 had a DO warning before dawn; all aerators were run until 07:00 and DO recovered. No abnormal mortality.',
    },
  )
  const s28 = snapshot(
    '2026-09-28',
    wib('2026-09-28', '18:20'),
    [
      [1, 190, 'Grower 2', 'good', 'clean', 18, 0.25, 'normal', [], null],
      [2, 152, 'Grower 2', 'reduced', 'leftover', 64, 0.82, 'attention', ['abnormal_swimming'], 'Shrimp near the surface at 05:30'],
      [3, 180, 'Grower 2', 'good', 'clean', 15, 0.2, 'normal', [], null],
      [4, 140, 'Grower 2', 'good', 'clean', 22, 0.28, 'normal', [], null],
      [5, 168, 'Grower 2', 'reduced', 'clean', 31, 0.4, 'attention', ['reduced_appetite'], 'Reduced appetite in the afternoon heat'],
      [6, 150, 'Grower 1', 'good', 'clean', 12, 0.15, 'normal', [], null],
      [7, 140, 'Grower 1', 'good', 'clean', 14, 0.17, 'normal', [], null],
      [8, 120, 'Grower 1', 'good', 'clean', 10, 0.13, 'normal', [], null],
    ],
    {
      farmStatus: 'warning',
      environment: { weather: 'cloudy', rainfallMm: 4, events: 'Light rain 13:00–14:00' },
      equipmentEvents: [
        { id: 'eq28-1', source: 'actuator', equipment: 'Turbidity sensor', pond: pondRef(pondN(8)), failure: 'Offline', occurredAt: wib('2026-09-28', '22:10'), action: 'Replacement requested', status: 'in_progress' },
      ],
      alerts: [
        pastAlert('ALT-1036', 2, 'DO below threshold', 'do', 'warning', wib('2026-09-28', '05:20'), wib('2026-09-28', '07:00'), 100),
        pastAlert('ALT-1037', 5, 'Temperature above threshold', 'temperature', 'attention', wib('2026-09-28', '14:10'), wib('2026-09-28', '16:00'), 110),
        pastAlert('ALT-1035', 8, 'Turbidity sensor offline', 'sensor_offline', 'attention', wib('2026-09-28', '22:10'), null, 110),
      ],
      actions: [
        { id: 'r28-1', source: 'alert_handling', at: wib('2026-09-28', '05:25'), pond: pondRef(pondN(2)), action: 'Increased aeration — all aerators on', outcome: 'DO recovered to 5.1 mg/L by 07:00' },
        { id: 'r28-2', source: 'alert_handling', at: wib('2026-09-28', '14:30'), pond: pondRef(pondN(5)), action: 'Water exchange — 10%', outcome: 'Temperature back to 30.3 °C by 16:00' },
        { id: 'r28-3', source: 'manual', at: wib('2026-09-28', '22:30'), pond: pondRef(pondN(8)), action: 'Equipment inspection — turbidity sensor', outcome: 'Replacement requested' },
      ],
      summary:
        'Cloudy with light rain 13:00–14:00. Pond 02 DO dropped below 4.5 mg/L before dawn; aeration was increased and DO recovered by 07:00. Pond 05 ate less in the afternoon heat. The Pond 08 turbidity sensor went offline at 22:10 — replacement requested.',
    },
  )
  const draftInputs: DraftInputs = {
    ...structuredClone(empty),
    ponds: {
      [pondN(2)]: {
        appetite: 'reduced',
        tray: 'leftover',
        mortalityNote: null,
        health: 'attention',
        observations: ['abnormal_swimming', 'reduced_appetite'],
        healthNote: 'Some shrimp near the surface at 05:30',
      },
    },
    excludedAlertIds: ['ALT-1035'],
    manualActions: [{ id: 'man-1', at: wib('2026-09-29', '06:30'), pondId: pondN(5), action: 'Equipment inspection — Aerator 4', outcome: 'Motor overheating, technician called' }],
    manualEquipmentEvents: [
      { id: 'eq-1', equipment: 'Aerator 4', pondId: pondN(5), failure: 'Motor overheating', occurredAt: wib('2026-09-29', '06:20'), action: 'Stopped, technician called', status: 'in_progress' },
    ],
  }
  const map = new Map<string, StoredReport>()
  map.set(s27.id, { id: s27.id, farmId: 'farm-a', date: '2026-09-27', status: 'submitted', savedAt: s27.submittedAt, submittedAt: s27.submittedAt, inputs: structuredClone(empty), snapshot: s27 })
  map.set(s28.id, { id: s28.id, farmId: 'farm-a', date: '2026-09-28', status: 'submitted', savedAt: s28.submittedAt, submittedAt: s28.submittedAt, inputs: structuredClone(empty), snapshot: s28 })
  map.set('daily-farm-a-2026-09-29', {
    id: 'daily-farm-a-2026-09-29',
    farmId: 'farm-a',
    date: '2026-09-29',
    status: 'draft',
    savedAt: '2026-09-29T02:20:00Z',
    submittedAt: null,
    inputs: draftInputs,
    snapshot: null,
  })
  for (const [farmId, date, time, alerts, status] of OTHER_DAILY) {
    const r = genericDaily(farmId, date, time, alerts, status)
    map.set(r.id, { id: r.id, farmId, date, status: 'submitted', savedAt: r.savedAt, submittedAt: r.submittedAt, inputs: structuredClone(empty), snapshot: r })
  }
  return map
}

export let reports = seed()
export function resetReports() {
  reports = seed()
}

// ── Operations used by the handlers ──

export const getReport = (id: string) => (reports.has(id) ? build(reports.get(id)!) : null)

/** Newest first, then by Farm. */
export function listReports(): DailyReport[] {
  return [...reports.values()].map(build).sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '') || a.farm.name.localeCompare(b.farm.name))
}

export function createReport(date: string): DailyReport | { conflict: string } {
  const existing = [...reports.values()].find((r) => r.farmId === 'farm-a' && r.date === date)
  if (existing) return { conflict: existing.id }
  const id = `daily-farm-a-${date}`
  reports.set(id, {
    id,
    farmId: 'farm-a',
    date,
    status: 'draft',
    savedAt: null,
    submittedAt: null,
    inputs: { ponds: {}, environment: { weather: null, rainfallMm: null, events: null }, excludedAlertIds: [], manualActions: [], manualEquipmentEvents: [], summary: null },
    snapshot: null,
  })
  return build(reports.get(id)!)
}

let seq = 0
export function saveReport(id: string, body: S['DailyReportInput']): DailyReport | 'submitted' | null {
  const rec = reports.get(id)
  if (!rec) return null
  if (rec.status === 'submitted') return 'submitted'
  const i = rec.inputs
  for (const p of body.ponds ?? []) {
    const { pondId, ...patch } = p
    i.ponds[pondId] = { ...(i.ponds[pondId] ?? defaultPond()), ...patch } as PondInput
  }
  if (body.environment) i.environment = { ...i.environment, ...body.environment }
  if (body.excludedAlertIds) i.excludedAlertIds = body.excludedAlertIds
  if (body.manualActions) {
    i.manualActions = body.manualActions.map((a) => ({ id: a.id ?? `man-${++seq}`, at: a.at, pondId: a.pondId ?? null, action: a.action, outcome: a.outcome ?? null }))
  }
  if (body.manualEquipmentEvents) {
    i.manualEquipmentEvents = body.manualEquipmentEvents.map((e) => ({
      id: e.id ?? `eq-${++seq}`,
      equipment: e.equipment,
      pondId: e.pondId ?? null,
      failure: e.failure,
      occurredAt: e.occurredAt,
      action: e.action ?? null,
      status: e.status,
    }))
  }
  if (body.summary !== undefined) i.summary = body.summary
  rec.savedAt = NOW
  return build(rec)
}

/** Missing required fields for submit (05 TM-04: Weather*, Technical Manager Summary*). */
export function missingFields(id: string): string[] {
  const rec = reports.get(id)!
  const missing: string[] = []
  if (!rec.inputs.environment.weather) missing.push('environment/weather')
  if (!rec.inputs.summary?.trim()) missing.push('summary')
  return missing
}

export function submitReport(id: string): DailyReport | 'submitted' | null {
  const rec = reports.get(id)
  if (!rec) return null
  if (rec.status === 'submitted') return 'submitted'
  rec.status = 'submitted'
  rec.submittedAt = NOW
  rec.savedAt = NOW
  rec.snapshot = build({ ...rec, snapshot: null })
  return build(rec)
}

/** TM-01 Report Status from the live store. */
export function dailyStatusToday(date: string): S['ReportStatusItem'] {
  const rec = [...reports.values()].find((r) => r.farmId === 'farm-a' && r.date === date)
  return {
    reportId: rec?.id ?? null,
    state: rec ? rec.status : 'not_started',
    date,
    dueAt: dueAt(date),
    savedAt: rec?.savedAt ?? null,
  }
}

export function lastSubmittedDaily(): S['ReportListItem'] | null {
  const r = listReports().find((x) => x.farm.id === 'farm-a' && x.status === 'submitted')
  if (!r) return null
  const { ponds: _p, totals: _t, environment: _e, equipmentEvents: _q, alerts: _a, actions: _c, summary: _s, previousReportId: _r, nextReportId: _n, previousReportDate: _rd, nextReportDate: _nd, ...item } = r
  return item
}
