import type { components } from '@/api/schema'
import type { SensorParameter, Severity } from '@/api/types'
import { NOW, farmAAlerts, farmAPonds, farmAWaterQuality } from './data'

/**
 * TM-03 Pond Detail mock (Farm A). Pond 02 uses the exact values of prototype/screens/tm-pond-detail.html;
 * the other Ponds get plausible values derived from their current readings.
 * The mock plays the backend, so it also evaluates thresholds (04 §6.2).
 */

type S = components['schemas']
type Threshold = S['Threshold']
type LabParameter = S['LabParameter']

const NOW_MS = Date.parse(NOW)
const MIN = 60_000
const HOUR = 60 * MIN
const iso = (ms: number) => new Date(ms).toISOString()

export const pondNo = (pondId: string) => Number(pondId.slice(-2))
export const findPond = (pondId: string) => farmAPonds.find((p) => p.pond.id === pondId)

// ── Thresholds (04 §6.2 sample values) ──

const th = (
  parameter: SensorParameter | LabParameter,
  unit: string,
  [criticalLow, warningLow, attentionLow]: (number | null)[],
  [attentionHigh, warningHigh, criticalHigh]: (number | null)[],
): Threshold => ({ parameter, unit, criticalLow, warningLow, attentionLow, attentionHigh, warningHigh, criticalHigh, inherited: true })

export const THRESHOLDS: Record<SensorParameter | LabParameter, Threshold> = {
  do: th('do', 'mg/L', [3.5, 4.5, 5.0], [null, null, null]),
  ph: th('ph', '', [7.0, 7.3, 7.5], [8.5, 8.7, 9.0]),
  temperature: th('temperature', '°C', [24, 26, 26.5], [30.5, 31, 33]),
  tds: th('tds', 'mg/L', [null, 15000, 16000], [24000, 25000, null]),
  turbidity: th('turbidity', 'NTU', [null, 20, 25], [60, 80, null]),
  water_level: th('water_level', 'cm', [105, 115, 120], [150, 155, null]),
  tan: th('tan', 'mg/L', [null, null, null], [1.0, 2.0, null]),
  no2: th('no2', 'mg/L', [null, null, null], [0.5, 1.0, null]),
  vibrio: th('vibrio', '×10³ CFU/mL', [null, null, null], [5, 10, null]),
  alkalinity: th('alkalinity', 'mg/L', [null, 80, 100], [150, 180, null]),
}

/** Severity of a value against boundary thresholds. Vibrio is Normal only below 5 (04 §6.2), so its High side is inclusive. */
export function judge(parameter: SensorParameter | LabParameter, value: number | null): Severity {
  if (value === null) return 'normal'
  const t = THRESHOLDS[parameter]
  const inclusive = parameter === 'vibrio'
  const above = (limit: number | null | undefined) => limit != null && (inclusive ? value >= limit : value > limit)
  const below = (limit: number | null | undefined) => limit != null && value < limit
  if (below(t.criticalLow) || above(t.criticalHigh)) return 'critical'
  if (below(t.warningLow) || above(t.warningHigh)) return 'warning'
  if (below(t.attentionLow) || above(t.attentionHigh)) return 'attention'
  return 'normal'
}

// ── Sensors ──

export const PARAMS: SensorParameter[] = ['do', 'ph', 'temperature', 'tds', 'turbidity', 'water_level']
const DEVICE_SUFFIX: Record<SensorParameter, string> = { do: 'DO', ph: 'PH', temperature: 'TMP', tds: 'TDS', turbidity: 'TRB', water_level: 'LVL' }
export const deviceId = (pondId: string, p: SensorParameter) => `A-P${String(pondNo(pondId)).padStart(2, '0')}-${DEVICE_SUFFIX[p]}`
const DIGITS: Record<SensorParameter, number> = { do: 1, ph: 1, temperature: 1, tds: -1, turbidity: 0, water_level: 0 }
const round = (v: number, p: SensorParameter) => {
  const f = 10 ** DIGITS[p]
  return Math.round(v * f) / f
}

/** Pond 02 DO, hourly 10:00 (28 Sep) … 09:00 (29 Sep) WIB — prototype chart values. */
const POND02_DO_HOURLY = [5.4, 5.8, 6.2, 6.5, 6.6, 6.5, 6.2, 5.9, 5.6, 5.3, 5.1, 5.0, 4.9, 4.8, 4.8, 4.7, 4.6, 4.6, 4.5, 4.6, 4.6, 4.5, 4.2, 4.1]
/** Pond 02 readings at 09:35 … 09:10 — prototype Historical Data rows (newest first). */
const POND02_RECENT: Record<SensorParameter, number[]> = {
  do: [4.1, 4.1, 4.1, 4.1, 4.2, 4.2],
  ph: [7.8, 7.8, 7.8, 7.8, 7.8, 7.8],
  temperature: [29.8, 29.8, 29.7, 29.7, 29.6, 29.6],
  tds: [18900, 18900, 18880, 18880, 18870, 18860],
  turbidity: [45, 45, 44, 44, 44, 43],
  water_level: [132, 132, 132, 132, 132, 132],
}
const AMPLITUDE: Record<SensorParameter, number> = { do: 0.8, ph: 0.15, temperature: 1.0, tds: 150, turbidity: 4, water_level: 1 }

/** Reading of `p` at time `ms` (≤ now). Deterministic; ends at the current value. null while a sensor is offline. */
export function readingAt(pondId: string, p: SensorParameter, ms: number): number | null {
  const row = farmAWaterQuality.find((r) => r.pond.id === pondId)!
  const current = row.values[p]
  if (current.value === null) return ms < Date.parse(current.measuredAt ?? NOW) ? 40 : null
  const ago = Math.max(0, NOW_MS - ms)
  if (pondId === 'farm-a-pond-02') {
    const step = Math.round(ago / (5 * MIN))
    if (step < 6) return POND02_RECENT[p][step]
    if (p === 'do' && ago <= 23 * HOUR + 35 * MIN) {
      // Interpolate the hourly prototype values (index 23 = 09:00 WIB = 25 min ago)
      const h = 23 - (ago - 35 * MIN) / HOUR
      const i = Math.max(0, Math.min(22, Math.floor(h)))
      const f = Math.max(0, Math.min(1, h - i))
      return round(POND02_DO_HOURLY[i] + (POND02_DO_HOURLY[i + 1] - POND02_DO_HOURLY[i]) * f, p)
    }
  }
  // Diurnal wave that equals the current value now
  const phase = (ago / (24 * HOUR)) * 2 * Math.PI
  return round(current.value + AMPLITUDE[p] * Math.sin(phase) * (p === 'do' ? 1 : 0.6), p)
}

// ── Alerts / anomalies ──

export const alertsOf = (pondId: string) => farmAAlerts.filter((a) => a.pond.id === pondId)
export const openAlertsOf = (pondId: string) => alertsOf(pondId).filter((a) => a.state !== 'resolved')

export function anomaliesOf(pondId: string): S['SensorAnomaly'][] {
  const base = { endedAt: null, extremeValue: null, change24h: null, comparedWith: null, withinRange: false, alertId: null }
  if (pondId === 'farm-a-pond-02') {
    return [
      { ...base, kind: 'decreasing', parameter: 'do', severity: 'warning', unit: 'mg/L', startedAt: iso(NOW_MS - 48 * HOUR), change24h: -1.3, comparedWith: '2026-09-27' },
      { ...base, kind: 'below_threshold', parameter: 'do', severity: 'warning', unit: 'mg/L', startedAt: '2026-09-29T00:50:00Z', extremeValue: 4.1, alertId: 'ALT-1042' },
      { ...base, kind: 'increasing', parameter: 'temperature', severity: 'attention', unit: '°C', startedAt: iso(NOW_MS - 24 * HOUR), change24h: 0.6, withinRange: true },
    ]
  }
  return openAlertsOf(pondId)
    .filter((a) => a.direction && a.value !== null)
    .map((a) => ({
      ...base,
      kind: a.direction === 'below' ? ('below_threshold' as const) : ('above_threshold' as const),
      parameter: a.parameter as SensorParameter,
      severity: a.severity,
      unit: a.unit ?? '',
      startedAt: a.occurredAt,
      extremeValue: a.value,
      alertId: a.id,
    }))
}

// ── Feeding / mortality / actuators: mutable per test run ──

export const SCHEDULE = ['06:00', '09:00', '13:00', '17:00']
export const FEED_TYPES = ['Grower 1 (1.6 mm)', 'Grower 2 (2.0 mm)', 'Grower 3 (2.5 mm)']
const feedTypeOf = (n: number) => (n <= 5 ? FEED_TYPES[1] : FEED_TYPES[0])
const sari = { id: 'u-sari', name: 'Sari Wijaya' }

type Feeding = S['FeedingRecord']
type Mortality = S['MortalityRecord']
type Actuator = S['Actuator']
type ActuatorLog = S['ActuatorLog']

function seedFeedings(): Feeding[] {
  const out: Feeding[] = []
  for (const row of farmAPonds) {
    const n = pondNo(row.pond.id)
    // Today's two rounds add up to the Pond List's "Feed today" (e.g. 91 kg = 45 + 46)
    const today = row.feedTodayKg ?? 0
    const per = Math.round(today / 2)
    const first = Math.floor(today / 2)
    const rows: [string, number, number, S['TrayCheck']][] =
      n === 2
        ? [
            ['2026-09-29', 2, 36, 'leftover_under_5'],
            ['2026-09-29', 1, 38, 'empty_within_2h'],
            ['2026-09-28', 4, 34, 'leftover_10'],
            ['2026-09-28', 3, 38, 'empty_within_2h'],
            ['2026-09-28', 2, 40, 'empty_within_2h'],
            ['2026-09-28', 1, 40, 'empty_within_2h'],
          ]
        : [
            ['2026-09-29', 2, today - first, 'empty_within_2h'],
            ['2026-09-29', 1, first, 'empty_within_2h'],
            ['2026-09-28', 4, per, 'empty_within_2h'],
            ['2026-09-28', 3, per, 'empty_within_2h'],
            ['2026-09-28', 2, per, 'empty_within_2h'],
            ['2026-09-28', 1, per, 'empty_within_2h'],
          ]
    rows.forEach(([date, r, kg, tray], i) =>
      out.push({
        id: `fd-${n}-${i}`,
        pondId: row.pond.id,
        date,
        round: r,
        time: SCHEDULE[r - 1],
        feedType: feedTypeOf(n),
        amountKg: kg,
        trayCheck: tray,
        note: null,
        recordedBy: sari,
        updatedAt: NOW,
      }),
    )
  }
  return out
}

function seedMortalities(): Mortality[] {
  const out: Mortality[] = []
  for (const row of farmAPonds) {
    const n = pondNo(row.pond.id)
    const rows: [string, number, number, S['MortalityObservation'] | null][] =
      n === 2
        ? [
            ['2026-09-29', 22, 0.3, 'routine_check'],
            ['2026-09-28', 64, 0.82, 'low_do'],
            ['2026-09-27', 41, 0.52, 'low_do'],
            ['2026-09-26', 18, 0.23, null],
            ['2026-09-25', 16, 0.2, null],
            ['2026-09-24', 14, 0.18, null],
            ['2026-09-23', 12, 0.18, null],
          ]
        : Array.from({ length: 7 }, (_, i) => {
            const count = i === 0 ? (row.mortalityTodayPcs ?? 0) : 10 + ((n * 7 + i * 3) % 9)
            // Pond 05 today: 0.24 kg as in the wireframe (19 × 0.013 would round to 0.25)
            const weight = n === 5 && i === 0 ? 0.24 : Math.round(count * 0.013 * 100) / 100
            return [`2026-09-${29 - i}`, count, weight, i === 0 ? 'routine_check' : null]
          })
    rows.forEach(([date, count, weightKg, observation], i) =>
      out.push({ id: `mt-${n}-${i}`, pondId: row.pond.id, date, count, weightKg, observation, note: null, recordedBy: sari, updatedAt: NOW }),
    )
  }
  return out
}

const AERATOR_SPEC = 'Paddlewheel · 2 HP'
const PUMP_SPEC = 'Inflow · 15 m³/h'

function seedActuators(): Actuator[] {
  const out: Actuator[] = []
  for (const row of farmAPonds) {
    const n = pondNo(row.pond.id)
    const code = `A-P${String(n).padStart(2, '0')}`
    const level = farmAWaterQuality.find((r) => r.pond.id === row.pond.id)!.values.water_level.value
    for (let i = 1; i <= row.aerators.total; i++) {
      const manual = n === 2 && i >= 3
      const on = i <= row.aerators.on
      out.push({
        id: `${code}-AER${i}`,
        type: 'aerator',
        name: `Aerator ${i}`,
        state: on ? 'on' : 'off',
        mode: manual ? 'manual' : 'auto',
        connection: 'online',
        autoRule: 'On when DO < 5.0',
        spec: AERATOR_SPEC,
        runtimeTodayH: on ? 9.6 : 0,
        modeSince: manual ? '2026-09-28T22:40:00Z' : null,
        lastRunAt: on ? null : '2026-09-28T23:00:00Z',
        safety: [],
        blockedCommands: [],
        updatedAt: NOW,
      })
    }
    if ([2, 5, 8].includes(n)) {
      out.push({
        id: `${code}-PMP1`,
        type: 'pump',
        name: 'Water Pump 1',
        state: 'off',
        mode: 'auto',
        connection: 'online',
        autoRule: 'Inflow when level < 125 cm',
        spec: PUMP_SPEC,
        runtimeTodayH: 0,
        modeSince: null,
        lastRunAt: '2026-09-28T08:10:00Z',
        safety: [
          { label: 'Current water level', value: `${level} cm` },
          { label: 'Safety limit', value: 'Stops at 150 cm' },
        ],
        blockedCommands: [],
        updatedAt: NOW,
      })
    }
  }
  return out
}

function seedActuatorLogs(): ActuatorLog[] {
  const log = (id: string, actuatorId: string, actuatorName: string, command: string, at: string, by: typeof sari | null, mode: ActuatorLog['mode'], result: ActuatorLog['result']): ActuatorLog => ({
    id,
    actuatorId,
    actuatorName,
    command,
    at,
    by,
    mode,
    result,
  })
  return [
    log('al-5', 'A-P02-AER4', 'Aerator 4', 'turn_on', '2026-09-28T22:40:00Z', sari, 'manual_override', 'succeeded'),
    log('al-4', 'A-P02-AER3', 'Aerator 3', 'turn_on', '2026-09-28T22:40:00Z', sari, 'manual_override', 'succeeded'),
    log('al-3', 'A-P02-PMP1', 'Water Pump 1', 'auto_off', '2026-09-28T09:10:00Z', null, 'auto', 'succeeded'),
    log('al-2', 'A-P02-PMP1', 'Water Pump 1', 'auto_on', '2026-09-28T08:10:00Z', null, 'auto', 'succeeded'),
    log('al-1', 'A-P02-AER3', 'Aerator 3', 'turn_off', '2026-09-28T04:05:00Z', sari, 'manual', 'blocked'),
  ]
}

const alertSeed = structuredClone(farmAAlerts)

/** Mutable mock state; `resetPondStore()` restores the seed (tests). */
export const store = {
  feedings: seedFeedings(),
  mortalities: seedMortalities(),
  actuators: seedActuators(),
  actuatorLogs: seedActuatorLogs(),
  samplingNotes: {} as Record<string, string | null>,
  seq: 100,
}

export function resetPondStore() {
  store.feedings = seedFeedings()
  store.mortalities = seedMortalities()
  store.actuators = seedActuators()
  store.actuatorLogs = seedActuatorLogs()
  store.samplingNotes = {}
  farmAAlerts.splice(0, farmAAlerts.length, ...structuredClone(alertSeed))
  store.seq = 100
}

export const nextId = (prefix: string) => `${prefix}-${++store.seq}`
