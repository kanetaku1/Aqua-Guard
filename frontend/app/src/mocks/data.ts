import type { components } from '@/api/schema'
import type {
  FarmDetail,
  Me,
  OperationalStatus,
  ParameterRange,
  PondWaterQualityRow,
  ReportStatusSummary,
  SensorValue,
  Severity,
  SyncStatus,
} from '@/api/types'

/**
 * Mock data — values from frontend/prototype/mock_data.md so screens match the prototype.
 * "Now" = 29 Sep 2026 09:35 WIB = 02:35 UTC. All date-times are UTC.
 */
export const NOW = '2026-09-29T02:35:00Z'
export const MOCK_PASSWORD = 'password123'

type MockUser = Me & { status: 'active' | 'invited' | 'deactivated' }

const company = 'Nusantara Shrimp Co.'

export const users: MockUser[] = [
  {
    id: 'u-hendra',
    name: 'Hendra Kusuma',
    initials: 'HK',
    email: 'hendra.kusuma@nusantarashrimp.co.id',
    role: 'farms_manager',
    language: 'en',
    company,
    scopeLabel: 'All Farms (4)',
    farm: null,
    status: 'active',
  },
  {
    id: 'u-sari',
    name: 'Sari Wijaya',
    initials: 'SW',
    email: 'sari.wijaya@nusantarashrimp.co.id',
    role: 'technical_manager',
    language: 'en',
    company,
    scopeLabel: 'Farm A · East Java',
    farm: { id: 'farm-a', name: 'Farm A' },
    status: 'active',
  },
  {
    id: 'u-yusuf',
    name: 'Yusuf Rahman',
    initials: 'YR',
    email: 'yusuf.rahman@nusantarashrimp.co.id',
    role: 'system_administrator',
    language: 'en',
    company,
    scopeLabel: 'System Administration',
    farm: null,
    status: 'active',
  },
  {
    id: 'u-eko',
    name: 'Eko Wibowo',
    initials: 'EW',
    email: 'eko.wibowo@nusantarashrimp.co.id',
    role: 'technical_manager',
    language: 'id',
    company,
    scopeLabel: 'Farm B · Lampung',
    farm: { id: 'farm-b', name: 'Farm B' },
    status: 'deactivated',
  },
]

/** Password links for AU-03: /set-password?token=invite-demo | reset-demo | expired-demo */
export const passwordTokens: Record<string, components['schemas']['PasswordToken'] | 'expired'> = {
  'invite-demo': {
    mode: 'invite',
    name: 'Fajar Nugroho',
    email: 'fajar.nugroho@nusantarashrimp.co.id',
    role: 'technical_manager',
    farm: { id: 'farm-d', name: 'Farm D' },
    expiresAt: '2026-10-01T17:00:00Z',
  },
  'reset-demo': { mode: 'reset', email: 'sari.wijaya@nusantarashrimp.co.id', expiresAt: '2026-09-29T03:35:00Z' },
  'expired-demo': 'expired',
}

export const syncStatus: SyncStatus = { quality: 'live', syncedAt: NOW, nextSyncAt: '2026-09-29T02:40:00Z' }

// ── Farm A (Technical Manager: Sari Wijaya) ──

export const farmA: FarmDetail = {
  id: 'farm-a',
  name: 'Farm A',
  location: 'East Java, Indonesia',
  pondCount: 8,
  status: 'warning',
  mainReason: 'Pond 02 DO below 4.5 mg/L for 2 days',
  waterQuality: { status: 'warning', count: 3, fact: '3 of 8 Ponds', detail: 'Pond 02 DO (2 days) · Pond 05 Temp · Pond 04 pH' },
  growth: { status: 'attention', count: 2, fact: '2 of 8 behind', detail: 'Pond 02 −8% · Pond 05 −7% (sampling 28 Sep)' },
  operations: { status: 'attention', count: 1, fact: '1 sensor offline', detail: 'Pond 08 turbidity sensor offline since 28 Sep 22:10 · reports on time' },
  openIssues: 3,
  technicalManagers: [{ id: 'u-sari', name: 'Sari Wijaya' }],
  docRange: { min: 34, max: 76 },
  updatedAt: NOW,
  statusSentence: 'Farm A is Warning because of water quality in Pond 02 and Pond 05.',
  latestReport: { id: 'daily-farm-a-2026-09-28', type: 'daily', label: 'Daily 28 Sep', date: '2026-09-28' },
}

const measuredAt = NOW
const v = (value: number, severity: Severity = 'normal'): SensorValue => ({ value, severity, quality: 'live', measuredAt })
const offline: SensorValue = { value: null, severity: 'normal', quality: 'offline', measuredAt: '2026-09-28T15:10:00Z' }
const pond = (n: number) => ({ id: `farm-a-pond-0${n}`, name: `Pond 0${n}` })

// Pond | Status | DO | pH | Temp | TDS | Turbidity | Level — mock_data.md "Farm A Ponds"
export const farmAWaterQuality: PondWaterQualityRow[] = [
  { pond: pond(1), status: 'normal', values: { do: v(5.9), ph: v(7.9), temperature: v(29.4), tds: v(18200), turbidity: v(38), water_level: v(135) }, openAlerts: 0, worstAlertState: null },
  { pond: pond(2), status: 'warning', values: { do: v(4.1, 'warning'), ph: v(7.8), temperature: v(29.8), tds: v(18900), turbidity: v(45), water_level: v(132) }, openAlerts: 1, worstAlertState: 'unacknowledged' },
  { pond: pond(3), status: 'normal', values: { do: v(6.1), ph: v(8.0), temperature: v(29.2), tds: v(17800), turbidity: v(35), water_level: v(138) }, openAlerts: 0, worstAlertState: null },
  { pond: pond(4), status: 'attention', values: { do: v(5.4), ph: v(7.4, 'attention'), temperature: v(29.5), tds: v(18400), turbidity: v(40), water_level: v(136) }, openAlerts: 1, worstAlertState: 'in_progress' },
  { pond: pond(5), status: 'warning', values: { do: v(5.0), ph: v(7.9), temperature: v(31.6, 'warning'), tds: v(18600), turbidity: v(42), water_level: v(130) }, openAlerts: 1, worstAlertState: 'acknowledged' },
  { pond: pond(6), status: 'normal', values: { do: v(6.0), ph: v(8.1), temperature: v(29.1), tds: v(17900), turbidity: v(33), water_level: v(137) }, openAlerts: 0, worstAlertState: null },
  { pond: pond(7), status: 'normal', values: { do: v(5.8), ph: v(8.0), temperature: v(29.3), tds: v(18100), turbidity: v(36), water_level: v(134) }, openAlerts: 0, worstAlertState: null },
  { pond: pond(8), status: 'normal', values: { do: v(5.7), ph: v(7.9), temperature: v(29.4), tds: v(18000), turbidity: offline, water_level: v(135) }, openAlerts: 1, worstAlertState: 'acknowledged' },
]

// Normal ranges — 04 §6.2 (sample thresholds)
export const normalRanges: ParameterRange[] = [
  { parameter: 'do', unit: 'mg/L', normalMin: 5.0, normalMax: null },
  { parameter: 'ph', unit: '', normalMin: 7.5, normalMax: 8.5 },
  { parameter: 'temperature', unit: '°C', normalMin: 26.5, normalMax: 30.5 },
  { parameter: 'tds', unit: 'mg/L', normalMin: 16000, normalMax: 24000 },
  { parameter: 'turbidity', unit: 'NTU', normalMin: 25, normalMax: 60 },
  { parameter: 'water_level', unit: 'cm', normalMin: 120, normalMax: 150 },
]

// Pond Alerts (Farm A) — mock_data.md; ALT-1011 from prototype tm-pond-detail.html
const sari = { id: 'u-sari', name: 'Sari Wijaya' }
type AlertDetail = components['schemas']['AlertDetail']

export const farmAAlerts: AlertDetail[] = [
  {
    id: 'ALT-1042', pond: pond(2), title: 'DO below threshold (4.1 mg/L < 4.5)', parameter: 'do', severity: 'warning',
    state: 'unacknowledged', value: 4.1, thresholdValue: 4.5, unit: 'mg/L', direction: 'below',
    occurredAt: '2026-09-29T00:50:00Z', resolvedAt: null, handledBy: null,
    sensor: { deviceId: 'A-P02-DO', connection: 'online' }, issueId: 'ISS-218', acknowledgedAt: null, acknowledgedBy: null,
    actions: [
      { id: 'act-1', performedAt: '2026-09-28T22:40:00Z', type: 'increased_aeration', note: 'Aerators 3 and 4 on', recordedBy: sari, source: 'actuator_log' },
    ],
  },
  {
    id: 'ALT-1041', pond: pond(5), title: 'Temperature above threshold (31.6 °C > 31.0)', parameter: 'temperature', severity: 'warning',
    state: 'acknowledged', value: 31.6, thresholdValue: 31.0, unit: '°C', direction: 'above',
    occurredAt: '2026-09-28T22:40:00Z', resolvedAt: null, handledBy: sari,
    sensor: { deviceId: 'A-P05-TMP', connection: 'online' }, issueId: 'ISS-221', acknowledgedAt: '2026-09-28T23:05:00Z', acknowledgedBy: sari,
    actions: [
      { id: 'act-3', performedAt: '2026-09-28T23:10:00Z', type: 'water_exchange', note: '10%', recordedBy: sari, source: 'alert_handling' },
    ],
  },
  {
    id: 'ALT-1039', pond: pond(4), title: 'pH below threshold (7.4 < 7.5)', parameter: 'ph', severity: 'attention',
    state: 'in_progress', value: 7.4, thresholdValue: 7.5, unit: '', direction: 'below',
    occurredAt: '2026-09-28T20:30:00Z', resolvedAt: null, handledBy: sari,
    sensor: { deviceId: 'A-P04-PH', connection: 'online' }, issueId: 'ISS-220', acknowledgedAt: '2026-09-28T23:00:00Z', acknowledgedBy: sari,
    actions: [
      { id: 'act-2', performedAt: '2026-09-29T00:30:00Z', type: 'water_treatment', note: 'Lime 25 kg applied', recordedBy: sari, source: 'alert_handling' },
    ],
  },
  {
    id: 'ALT-1035', pond: pond(8), title: 'Turbidity sensor offline', parameter: 'sensor_offline', severity: 'attention',
    state: 'acknowledged', value: null, thresholdValue: null, unit: null, direction: null,
    occurredAt: '2026-09-28T15:10:00Z', resolvedAt: null, handledBy: sari,
    sensor: { deviceId: 'A-P08-TRB', connection: 'offline' }, issueId: null, acknowledgedAt: '2026-09-28T15:30:00Z', acknowledgedBy: sari,
    actions: [],
  },
  {
    id: 'ALT-1030', pond: pond(2), title: 'DO below threshold (4.3 mg/L < 4.5)', parameter: 'do', severity: 'warning',
    state: 'resolved', value: 4.3, thresholdValue: 4.5, unit: 'mg/L', direction: 'below',
    occurredAt: '2026-09-26T22:15:00Z', resolvedAt: '2026-09-27T00:05:00Z', handledBy: sari,
    sensor: { deviceId: 'A-P02-DO', connection: 'online' }, issueId: 'ISS-218', acknowledgedAt: '2026-09-26T22:25:00Z', acknowledgedBy: sari,
    actions: [
      { id: 'act-3', performedAt: '2026-09-26T22:30:00Z', type: 'increased_aeration', note: 'All aerators on until 07:00', recordedBy: sari, source: 'alert_handling' },
    ],
  },
  {
    id: 'ALT-1011', pond: pond(2), title: 'Water level below range (118 cm < 120)', parameter: 'water_level', severity: 'attention',
    state: 'resolved', value: 118, thresholdValue: 120, unit: 'cm', direction: 'below',
    occurredAt: '2026-09-21T07:20:00Z', resolvedAt: '2026-09-21T10:00:00Z', handledBy: sari,
    sensor: { deviceId: 'A-P02-LVL', connection: 'online' }, issueId: null, acknowledgedAt: '2026-09-21T07:35:00Z', acknowledgedBy: sari,
    actions: [
      { id: 'act-4', performedAt: '2026-09-21T08:00:00Z', type: 'water_exchange', note: 'Inflow pump 2 h', recordedBy: sari, source: 'alert_handling' },
    ],
  },
]

export const farmAOperationalStatus: OperationalStatus = {
  aerators: { on: 19, total: 20 },
  pumps: { on: 2, total: 3 },
  sensors: {
    online: 47,
    total: 48,
    offline: [{ deviceId: 'A-P08-TRB', pond: pond(8), parameter: 'turbidity', since: '2026-09-28T15:10:00Z' }],
  },
  feedingToday: { roundsDone: 2, roundsPlanned: 4, totalKg: 596 },
  nextSampling: '2026-10-05',
  generator: { state: 'standby', lastTestedAt: '2026-09-29T00:00:00Z' },
}

export const farmAReportStatus: ReportStatusSummary = {
  dailyToday: {
    reportId: 'daily-farm-a-2026-09-29',
    state: 'draft',
    date: '2026-09-29',
    dueAt: '2026-09-29T11:00:00Z', // 18:00 WIB
    savedAt: '2026-09-29T02:20:00Z', // 09:20 WIB
  },
  weeklyThisWeek: {
    reportId: 'weekly-farm-a-2026-09-22',
    state: 'draft',
    weekStart: '2026-09-22',
    weekEnd: '2026-09-28',
    dueAt: '2026-09-29T16:59:00Z', // Mon 29 Sep 23:59 WIB
    savedAt: '2026-09-28T13:15:00Z', // 28 Sep 20:15 WIB
  },
  lastSubmitted: {
    id: 'daily-farm-a-2026-09-28',
    type: 'daily',
    farm: { id: 'farm-a', name: 'Farm A' },
    date: '2026-09-28',
    technicalManager: { id: 'u-sari', name: 'Sari Wijaya' },
    status: 'submitted',
    issueCount: 3,
    submittedAt: '2026-09-28T11:20:00Z', // 18:20 WIB
    dueAt: '2026-09-28T11:00:00Z',
    savedAt: '2026-09-28T11:20:00Z',
  },
}

// ── TM-02 Pond List (prototype screens/tm-ponds.html; sampling 28 Sep) ──

type PondListRow = components['schemas']['PondListRow']
type SamplingRecord = components['schemas']['SamplingRecord']
type GrowthTargetPoint = components['schemas']['GrowthTargetPoint']

const listRow = (
  n: number,
  areaHa: number,
  stockedOn: string,
  doc: number,
  status: Severity,
  alert: PondListRow['worstAlertState'],
  abwG: number,
  vsTargetPct: number,
  feedTodayKg: number,
  mortalityTodayPcs: number,
  aerators: [number, number],
): PondListRow => ({
  pond: pond(n),
  areaHa,
  stockedOn,
  doc,
  status,
  openAlerts: alert ? 1 : 0,
  worstAlertState: alert,
  abwG,
  vsTargetPct,
  growth: vsTargetPct <= -5 ? 'behind' : vsTargetPct >= 5 ? 'ahead' : 'on_track',
  feedTodayKg,
  feedRoundsToday: 2,
  feedRoundsPlanned: 4,
  mortalityTodayPcs,
  aerators: { on: aerators[0], total: aerators[1] },
})

export const farmAPonds: PondListRow[] = [
  listRow(1, 0.4, '2026-07-15', 76, 'normal', null, 18.0, -1, 91, 6, [2, 2]),
  listRow(2, 0.5, '2026-07-29', 62, 'warning', 'unacknowledged', 13.8, -8, 74, 22, [4, 4]),
  listRow(3, 0.4, '2026-07-22', 69, 'normal', null, 16.9, 2, 86, 5, [2, 2]),
  listRow(4, 0.4, '2026-08-05', 55, 'attention', 'in_progress', 12.9, -3, 67, 7, [2, 2]),
  listRow(5, 0.5, '2026-07-29', 62, 'warning', 'acknowledged', 13.9, -7, 80, 19, [3, 4]),
  listRow(6, 0.4, '2026-08-12', 48, 'normal', null, 11.8, 3, 72, 5, [2, 2]),
  listRow(7, 0.4, '2026-08-19', 41, 'normal', null, 9.4, -1, 68, 6, [2, 2]),
  listRow(8, 0.4, '2026-08-26', 34, 'normal', 'acknowledged', 7.6, 3, 58, 4, [2, 2]),
]
export const farmALatestSampling = '2026-09-28'

/** Target growth curve (04 §5) and On track band. */
export const growthCurve: GrowthTargetPoint[] = [
  { doc: 27, targetAbwG: 5.3 },
  { doc: 34, targetAbwG: 7.4 },
  { doc: 41, targetAbwG: 9.5 },
  { doc: 48, targetAbwG: 11.5 },
  { doc: 55, targetAbwG: 13.3 },
  { doc: 62, targetAbwG: 15.0 },
  { doc: 69, targetAbwG: 16.6 },
  { doc: 76, targetAbwG: 18.2 },
]
export const onTrackBandPct = 5

type Measured = Pick<SamplingRecord, 'sampleCount' | 'sampleWeightG' | 'tan' | 'no2' | 'vibrio' | 'alkalinity'>
const m = (count: number | null, weight: number | null, tan: number | null, no2: number | null, vibrio: number | null, alk: number | null): Measured => ({
  sampleCount: count,
  sampleWeightG: weight,
  tan,
  no2,
  vibrio,
  alkalinity: alk,
})

/**
 * Recorded weekly sampling per date and Pond number (mock_data.md "Weekly sampling" / "Laboratory per Pond").
 * 5 Oct is the next sampling, shown in progress (Ponds 01–03 entered).
 */
export const samplingInputs: Record<string, Record<number, Measured>> = {
  // Pond 02 earlier weeks (prototype ABW chart / Sampling History)
  '2026-08-17': { 2: m(100, 300, null, null, null, null) },
  '2026-08-24': { 2: m(100, 490, null, null, null, null) },
  '2026-08-31': { 2: m(100, 700, null, null, null, null) },
  '2026-09-07': { 2: m(100, 910, 0.4, 0.12, 3.9, 135) },
  '2026-09-14': { 2: m(100, 1070, 0.5, 0.15, 4.8, 132) },
  '2026-09-21': {
    1: m(100, 1650, 0.3, 0.1, 3.1, 138),
    2: m(100, 1230, 0.6, 0.18, 6.2, 130),
    3: m(100, 1530, 0.3, 0.09, 2.8, 140),
    4: m(100, 1130, 0.4, 0.12, 4.0, 126),
    5: m(100, 1240, 0.5, 0.15, 8.5, 132),
    6: m(100, 990, 0.2, 0.08, 2.2, 142),
    7: m(100, 760, 0.3, 0.1, 3.0, 139),
    8: m(100, 550, 0.3, 0.11, 2.6, 137),
  },
  '2026-09-28': {
    1: m(100, 1800, 0.4, 0.12, 3.5, 135),
    2: m(100, 1380, 0.8, 0.22, 7.2, 128),
    3: m(100, 1690, 0.4, 0.1, 3.0, 138),
    4: m(100, 1290, 0.5, 0.14, 4.4, 118),
    5: m(100, 1390, 0.6, 0.17, 6.8, 130),
    6: m(100, 1180, 0.3, 0.09, 2.5, 140),
    7: m(100, 940, 0.3, 0.11, 3.2, 137),
    8: m(100, 760, null, null, null, null),
  },
  '2026-10-05': {
    1: m(100, 1930, 0.4, 0.11, null, 134),
    2: m(100, 1480, 0.9, 0.24, null, 126),
    3: m(100, 1810, 0.4, 0.1, null, 137),
  },
}
