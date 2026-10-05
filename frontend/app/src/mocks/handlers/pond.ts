import { HttpResponse, http } from 'msw'
import type { components } from '@/api/schema'
import type { SensorParameter } from '@/api/types'
import { NOW, farmAAlerts, farmAWaterQuality, growthCurve, samplingInputs } from '../data'
import { api, currentUser, problem } from '../http'
import {
  FEED_TYPES,
  PARAMS,
  SCHEDULE,
  THRESHOLDS,
  anomaliesOf,
  deviceId,
  findPond,
  judge,
  nextId,
  openAlertsOf,
  pondNo,
  readingAt,
  store,
} from '../pondDetail'
import { toRecord } from './ponds'

/** TM-03 Pond Detail (Farm A). Technical Manager of the Pond's Farm only. */

type S = components['schemas']
const TODAY = '2026-09-29'
const NOW_MS = Date.parse(NOW)
const MIN = 60_000

function denyPond(pondId: string) {
  const user = currentUser()
  if (!user) return problem(401, 'unauthenticated', 'Not signed in')
  if (user.role !== 'technical_manager') return problem(403, 'forbidden', 'Not allowed for this role')
  if (!findPond(pondId) || user.farm?.id !== 'farm-a') return problem(404, 'not_found', 'Pond not found')
  return null
}

const me = () => {
  const u = currentUser()!
  return { id: u.id, name: u.name }
}

const paginate = <T,>(items: T[], url: URL) => {
  const page = Number(url.searchParams.get('page') ?? 1)
  const pageSize = Number(url.searchParams.get('pageSize') ?? 20)
  return { items: items.slice((page - 1) * pageSize, page * pageSize), page, pageSize, total: items.length }
}

const futureDate = (date: string) => date > TODAY
const invalid = (field: string, message: string) => problem(422, 'validation_error', message, { fieldErrors: [{ field, message }] })

// ── Feeding / mortality helpers ──

const byNewest = <T extends { date: string }>(a: T, b: T, tie = 0) => b.date.localeCompare(a.date) || tie

function feedingResponse(pondId: string, url: URL) {
  const items = store.feedings
    .filter((f) => f.pondId === pondId)
    .sort((a, b) => byNewest(a, b, b.round - a.round))
  const dates = [...new Set(items.map((f) => f.date))].slice(0, 2).sort()
  const dailyTotals = dates.map((date) => ({
    date,
    totalKg: items.filter((f) => f.date === date).reduce((sum, f) => sum + f.amountKg, 0),
  }))
  return { ...paginate(items, url), dailyTotals }
}

function mortalityResponse(pondId: string, url: URL) {
  const items = store.mortalities.filter((m) => m.pondId === pondId).sort((a, b) => byNewest(a, b))
  const recent = items.filter((m) => m.date >= '2026-09-23' && m.date <= TODAY)
  const last7Days = {
    count: recent.reduce((s, m) => s + m.count, 0),
    weightKg: Math.round(recent.reduce((s, m) => s + m.weightKg, 0) * 100) / 100,
  }
  return { ...paginate(items, url), last7Days }
}

// ── Actuators ──

const actuatorsOf = (pondId: string) => store.actuators.filter((a) => a.id.startsWith(`A-P${String(pondNo(pondId)).padStart(2, '0')}-`))

/** Safety Layer (mock rule): keep 2 aerators running while DO < 4.5 mg/L; never pump in at or above 150 cm. */
function withSafety(pondId: string): S['Actuator'][] {
  const row = farmAWaterQuality.find((r) => r.pond.id === pondId)!
  const dO = row.values.do.value ?? 99
  const level = row.values.water_level.value ?? 0
  const list = actuatorsOf(pondId)
  const aeratorsOn = list.filter((a) => a.type === 'aerator' && a.state === 'on').length
  return list.map((a) => {
    const blocked: S['Actuator']['blockedCommands'] = []
    if (a.type === 'aerator' && a.state === 'on' && dO < 4.5 && aeratorsOn <= 2) {
      blocked.push({ command: 'turn_off', reason: 'At least 2 aerators must run while DO < 4.5 mg/L' })
    }
    if (a.type === 'pump' && a.state === 'off' && level >= 150) {
      blocked.push({ command: 'turn_on', reason: 'Water level is at the 150 cm safety limit' })
    }
    const safety =
      a.type === 'aerator'
        ? [
            { label: 'Current DO', value: `${row.values.do.value ?? '—'} mg/L` },
            { label: 'Safety rule', value: '2 aerators on while DO < 4.5' },
          ]
        : a.safety
    return { ...a, blockedCommands: blocked, safety }
  })
}

function autoControl(pondId: string) {
  const list = actuatorsOf(pondId)
  const aerators = list.filter((a) => a.type === 'aerator').length
  const pump = list.some((a) => a.type === 'pump')
  return {
    status: 'running' as const,
    target: 'DO ≥ 5.0',
    overrides: list.filter((a) => a.mode === 'manual').length,
    scope: `Aerator 1–${aerators}${pump ? ' and Water Pump 1' : ''}`,
  }
}

export const pondDetailHandlers = [
  http.get(api('/ponds/:pondId'), ({ params }) => {
    const pondId = params.pondId as string
    const denied = denyPond(pondId)
    if (denied) return denied
    const row = findPond(pondId)!
    const n = pondNo(pondId)
    const perRound = Math.round(((row.feedTodayKg ?? 0) / 2) * 10) / 10
    const detail: S['PondDetail'] = {
      pond: row.pond,
      farm: { id: 'farm-a', name: 'Farm A' },
      status: row.status,
      areaHa: row.areaHa,
      stockedOn: row.stockedOn,
      doc: row.doc,
      stockedPl: n === 2 || n === 5 ? 150_000 : 120_000,
      abwG: row.abwG,
      openAlerts: openAlertsOf(pondId).length,
      feeding: {
        schedule: SCHEDULE,
        feedTypes: FEED_TYPES,
        planToday: SCHEDULE.map((_, i) =>
          n === 2
            ? { round: i + 1, amountKg: 38, note: i >= 2 ? 'reduced 10% due to low DO' : null }
            : { round: i + 1, amountKg: perRound, note: null },
        ),
      },
      updatedAt: NOW,
    }
    return HttpResponse.json(detail)
  }),

  http.get(api('/ponds/:pondId/sensors/current'), ({ params }) => {
    const pondId = params.pondId as string
    const denied = denyPond(pondId)
    if (denied) return denied
    const row = farmAWaterQuality.find((r) => r.pond.id === pondId)!
    const items = PARAMS.map((p) => ({
      ...row.values[p],
      parameter: p,
      unit: THRESHOLDS[p].unit ?? '',
      deviceId: deviceId(pondId, p),
      threshold: THRESHOLDS[p],
    }))
    return HttpResponse.json({ items })
  }),

  http.get(api('/ponds/:pondId/sensors/series'), ({ params, request }) => {
    const pondId = params.pondId as string
    const denied = denyPond(pondId)
    if (denied) return denied
    const url = new URL(request.url)
    const parameter = url.searchParams.get('parameter') as SensorParameter
    const from = Date.parse(url.searchParams.get('from')!)
    const to = Math.min(Date.parse(url.searchParams.get('to')!), NOW_MS)
    const interval = url.searchParams.get('interval') ?? '1h'
    const stepMin = { '5m': 5, '15m': 15, '1h': 60, '6h': 360, '1d': 1440 }[interval] ?? 60
    const step = stepMin * MIN
    const points = []
    for (let t = Math.ceil(from / step) * step; t <= to; t += step) {
      points.push({ t: new Date(t).toISOString(), avg: readingAt(pondId, parameter, t), min: null, max: null })
    }
    return HttpResponse.json({ parameter, unit: THRESHOLDS[parameter].unit, interval, points, threshold: THRESHOLDS[parameter] })
  }),

  http.get(api('/ponds/:pondId/sensors/history'), ({ params, request }) => {
    const pondId = params.pondId as string
    const denied = denyPond(pondId)
    if (denied) return denied
    const url = new URL(request.url)
    const from = Date.parse(url.searchParams.get('from')!)
    const to = Math.min(Date.parse(url.searchParams.get('to')!), NOW_MS)
    const rows = []
    for (let t = Math.floor(to / (5 * MIN)) * 5 * MIN; t >= from; t -= 5 * MIN) {
      const values = Object.fromEntries(
        PARAMS.map((p) => {
          const value = readingAt(pondId, p, t)
          return [p, { value, severity: judge(p, value) }]
        }),
      ) as S['SensorHistoryRow']['values']
      rows.push({ measuredAt: new Date(t).toISOString(), values })
    }
    return HttpResponse.json(paginate(rows, url))
  }),

  http.get(api('/ponds/:pondId/sensors/anomalies'), ({ params }) => {
    const pondId = params.pondId as string
    return denyPond(pondId) ?? HttpResponse.json({ items: anomaliesOf(pondId) })
  }),

  // ── Alerts ──
  http.get(api('/alerts/:alertId'), ({ params }) => {
    const alert = findAlert(params.alertId as string)
    if (!alert) return problem(404, 'not_found', 'Alert not found')
    return denyPond(alert.pond.id) ?? HttpResponse.json(alert)
  }),

  http.post(api('/alerts/:alertId/acknowledge'), ({ params }) => {
    const alert = findAlert(params.alertId as string)
    if (!alert) return problem(404, 'not_found', 'Alert not found')
    const denied = denyPond(alert.pond.id)
    if (denied) return denied
    if (alert.state !== 'unacknowledged') return problem(409, 'invalid_state', 'Alert is already acknowledged')
    Object.assign(alert, { state: 'acknowledged', acknowledgedAt: NOW, acknowledgedBy: me(), handledBy: me() })
    return HttpResponse.json(alert)
  }),

  http.post(api('/alerts/:alertId/actions'), async ({ params, request }) => {
    const alert = findAlert(params.alertId as string)
    if (!alert) return problem(404, 'not_found', 'Alert not found')
    const denied = denyPond(alert.pond.id)
    if (denied) return denied
    if (alert.state === 'resolved') return problem(409, 'invalid_state', 'Alert is resolved')
    const body = (await request.json()) as S['AlertActionInput']
    alert.actions.push({ ...body, id: nextId('act'), recordedBy: me(), source: 'alert_handling' })
    alert.actions.sort((a, b) => a.performedAt.localeCompare(b.performedAt))
    if (alert.state === 'unacknowledged') Object.assign(alert, { acknowledgedAt: NOW, acknowledgedBy: me() })
    Object.assign(alert, { state: 'in_progress', handledBy: me() })
    return HttpResponse.json(alert, { status: 201 })
  }),

  http.post(api('/alerts/:alertId/resolve'), ({ params }) => {
    const alert = findAlert(params.alertId as string)
    if (!alert) return problem(404, 'not_found', 'Alert not found')
    const denied = denyPond(alert.pond.id)
    if (denied) return denied
    if (alert.state === 'unacknowledged' || alert.state === 'resolved') {
      return problem(409, 'invalid_state', 'Acknowledge the alert before resolving it')
    }
    Object.assign(alert, { state: 'resolved', resolvedAt: NOW, handledBy: me() })
    return HttpResponse.json(alert)
  }),

  // ── Feeding ──
  http.get(api('/ponds/:pondId/feedings'), ({ params, request }) => {
    const pondId = params.pondId as string
    return denyPond(pondId) ?? HttpResponse.json(feedingResponse(pondId, new URL(request.url)))
  }),

  http.post(api('/ponds/:pondId/feedings'), async ({ params, request }) => {
    const pondId = params.pondId as string
    const denied = denyPond(pondId)
    if (denied) return denied
    const body = (await request.json()) as S['FeedingInput']
    if (futureDate(body.date)) return invalid('date', 'Records cannot be in the future')
    if (store.feedings.some((f) => f.pondId === pondId && f.date === body.date && f.round === body.round)) {
      return problem(409, 'duplicate_round', 'This round is already recorded')
    }
    const record: S['FeedingRecord'] = {
      ...body,
      trayCheck: body.trayCheck ?? null,
      note: body.note ?? null,
      time: SCHEDULE[body.round - 1],
      id: nextId('fd'),
      pondId,
      recordedBy: me(),
      updatedAt: NOW,
    }
    store.feedings.push(record)
    return HttpResponse.json(record, { status: 201 })
  }),

  http.patch(api('/feedings/:recordId'), async ({ params, request }) => {
    const record = store.feedings.find((f) => f.id === params.recordId)
    if (!record) return problem(404, 'not_found', 'Record not found')
    const denied = denyPond(record.pondId)
    if (denied) return denied
    const body = (await request.json()) as S['FeedingInput']
    if (futureDate(body.date)) return invalid('date', 'Records cannot be in the future')
    Object.assign(record, body, { time: SCHEDULE[body.round - 1], updatedAt: NOW })
    return HttpResponse.json(record)
  }),

  // ── Mortality ──
  http.get(api('/ponds/:pondId/mortalities'), ({ params, request }) => {
    const pondId = params.pondId as string
    return denyPond(pondId) ?? HttpResponse.json(mortalityResponse(pondId, new URL(request.url)))
  }),

  http.post(api('/ponds/:pondId/mortalities'), async ({ params, request }) => {
    const pondId = params.pondId as string
    const denied = denyPond(pondId)
    if (denied) return denied
    const body = (await request.json()) as S['MortalityInput']
    if (futureDate(body.date)) return invalid('date', 'Records cannot be in the future')
    const record: S['MortalityRecord'] = {
      ...body,
      observation: body.observation ?? null,
      note: body.note ?? null,
      id: nextId('mt'),
      pondId,
      recordedBy: me(),
      updatedAt: NOW,
    }
    store.mortalities.push(record)
    return HttpResponse.json(record, { status: 201 })
  }),

  http.patch(api('/mortalities/:recordId'), async ({ params, request }) => {
    const record = store.mortalities.find((m) => m.id === params.recordId)
    if (!record) return problem(404, 'not_found', 'Record not found')
    const denied = denyPond(record.pondId)
    if (denied) return denied
    const body = (await request.json()) as S['MortalityInput']
    if (futureDate(body.date)) return invalid('date', 'Records cannot be in the future')
    Object.assign(record, body, { updatedAt: NOW })
    return HttpResponse.json(record)
  }),

  // ── Sampling (shares the weekly sampling store with TM-02) ──
  http.get(api('/ponds/:pondId/samplings'), ({ params }) => {
    const pondId = params.pondId as string
    const denied = denyPond(pondId)
    if (denied) return denied
    const n = pondNo(pondId)
    const items = Object.keys(samplingInputs)
      .filter((d) => samplingInputs[d][n])
      .sort()
      .reverse()
      .map((d) => toRecord(d, n))
    return HttpResponse.json({ items, growthCurve })
  }),

  http.post(api('/ponds/:pondId/samplings'), async ({ params, request }) => {
    const pondId = params.pondId as string
    const denied = denyPond(pondId)
    if (denied) return denied
    const body = (await request.json()) as S['SamplingInput']
    if (futureDate(body.date)) return invalid('date', 'Records cannot be in the future')
    return saveSampling(pondNo(pondId), body, 201)
  }),

  http.patch(api('/samplings/:recordId'), async ({ params, request }) => {
    const [, ...rest] = (params.recordId as string).split('-') // smp-YYYY-MM-DD-n
    const n = Number(rest.pop())
    const oldDate = rest.join('-')
    if (!samplingInputs[oldDate]?.[n]) return problem(404, 'not_found', 'Record not found')
    const denied = denyPond(`farm-a-pond-0${n}`)
    if (denied) return denied
    const body = (await request.json()) as S['SamplingInput']
    if (futureDate(body.date)) return invalid('date', 'Records cannot be in the future')
    if (body.date !== oldDate) delete samplingInputs[oldDate][n]
    return saveSampling(n, body, 200)
  }),

  // ── Actuators ──
  http.get(api('/ponds/:pondId/actuators'), ({ params }) => {
    const pondId = params.pondId as string
    return denyPond(pondId) ?? HttpResponse.json({ items: withSafety(pondId), autoControl: autoControl(pondId) })
  }),

  http.post(api('/actuators/:actuatorId/commands'), async ({ params, request }) => {
    const actuator = store.actuators.find((a) => a.id === params.actuatorId)
    if (!actuator) return problem(404, 'not_found', 'Actuator not found')
    const pondId = `farm-a-pond-${actuator.id.slice(3, 5)}`
    const denied = denyPond(pondId)
    if (denied) return denied
    const { command } = (await request.json()) as { command: S['ActuatorCommand'] }
    const current = withSafety(pondId).find((a) => a.id === actuator.id)!
    const block = current.blockedCommands.find((b) => b.command === command)
    const wasAuto = actuator.mode === 'auto'
    const log = (mode: S['ActuatorLog']['mode'], result: S['ActuatorLog']['result']) =>
      store.actuatorLogs.unshift({ id: nextId('al'), actuatorId: actuator.id, actuatorName: actuator.name, command, at: NOW, by: me(), mode, result })
    if (block) {
      log('manual', 'blocked')
      return problem(409, 'safety_blocked', 'Blocked by Safety Layer', { detail: block.reason })
    }
    if (command === 'turn_on' || command === 'turn_off') {
      Object.assign(actuator, {
        state: command === 'turn_on' ? 'on' : 'off',
        mode: 'manual',
        modeSince: wasAuto ? NOW : actuator.modeSince,
        lastRunAt: command === 'turn_off' ? NOW : null,
      })
      log(wasAuto ? 'manual_override' : 'manual', 'succeeded')
    } else if (command === 'set_manual') {
      Object.assign(actuator, { mode: 'manual', modeSince: NOW })
      log('manual_override', 'succeeded')
    } else {
      Object.assign(actuator, { mode: 'auto', modeSince: null })
      log('auto', 'succeeded')
    }
    return HttpResponse.json(actuator, { status: 202 })
  }),

  http.get(api('/ponds/:pondId/actuator-logs'), ({ params, request }) => {
    const pondId = params.pondId as string
    const denied = denyPond(pondId)
    if (denied) return denied
    const prefix = `A-P${String(pondNo(pondId)).padStart(2, '0')}-`
    return HttpResponse.json(paginate(store.actuatorLogs.filter((l) => l.actuatorId.startsWith(prefix)), new URL(request.url)))
  }),
]

const findAlert = (id: string) => farmAAlerts.find((a) => a.id === id)

function saveSampling(n: number, body: S['SamplingInput'], status: number) {
  if ((body.sampleCount == null) !== (body.sampleWeightG == null)) {
    return invalid('sampleWeightG', 'Enter both sample count and total weight')
  }
  samplingInputs[body.date] ??= {}
  samplingInputs[body.date][n] = {
    sampleCount: body.sampleCount ?? null,
    sampleWeightG: body.sampleWeightG ?? null,
    tan: body.tan ?? null,
    no2: body.no2 ?? null,
    vibrio: body.vibrio ?? null,
    alkalinity: body.alkalinity ?? null,
  }
  const id = `smp-${body.date}-${n}`
  store.samplingNotes[id] = body.note ?? null
  return HttpResponse.json(toRecord(body.date, n), { status })
}
