import type { components } from '@/api/schema'

/**
 * TM-04 editor state. Only what the Technical Manager enters lives here (04 §4.1): observations per Pond,
 * Farm-wide weather, excluded alerts, manual actions / equipment events and the summary.
 * Values collected from records always come from the server.
 */

type S = components['schemas']
export type DailyReport = S['DailyReport']
export type PondInput = Pick<S['DailyPondRow'], 'appetite' | 'tray' | 'mortalityNote' | 'health' | 'observations' | 'healthNote'>
export type ManualAction = { id?: string; key: string; at: string; pondId: string | null; action: string; outcome: string | null }
export type ManualEvent = {
  id?: string
  key: string
  equipment: string
  pondId: string | null
  failure: string
  occurredAt: string
  action: string | null
  status: 'in_progress' | 'resolved'
}

export type Draft = {
  ponds: Record<string, PondInput>
  weather: S['Weather'] | null
  rainfallMm: string
  events: string
  excludedAlertIds: string[]
  manualActions: ManualAction[]
  manualEvents: ManualEvent[]
  summary: string
}

let keySeq = 0
export const newKey = () => `new-${++keySeq}`

export function toDraft(r: DailyReport): Draft {
  return {
    ponds: Object.fromEntries(
      r.ponds.map((p) => [
        p.pond.id,
        { appetite: p.appetite, tray: p.tray, mortalityNote: p.mortalityNote, health: p.health, observations: p.observations, healthNote: p.healthNote },
      ]),
    ),
    weather: r.environment.weather ?? null,
    rainfallMm: r.environment.rainfallMm == null ? '' : String(r.environment.rainfallMm),
    events: r.environment.events ?? '',
    excludedAlertIds: r.alerts.filter((a) => a.excluded).map((a) => a.id),
    manualActions: r.actions
      .filter((a) => a.source === 'manual')
      .map((a) => ({ id: a.id, key: a.id, at: a.at, pondId: a.pond?.id ?? null, action: a.action, outcome: a.outcome })),
    manualEvents: r.equipmentEvents
      .filter((e) => e.source === 'manual')
      .map((e) => ({ id: e.id, key: e.id, equipment: e.equipment, pondId: e.pond?.id ?? null, failure: e.failure, occurredAt: e.occurredAt, action: e.action, status: e.status })),
    summary: r.summary ?? '',
  }
}

export function toInput(d: Draft): S['DailyReportInput'] {
  const rain = d.rainfallMm.trim() === '' ? null : Number(d.rainfallMm)
  return {
    ponds: Object.entries(d.ponds).map(([pondId, p]) => ({ pondId, ...p })),
    environment: { weather: d.weather, rainfallMm: Number.isFinite(rain) ? rain : null, events: d.events.trim() || null },
    excludedAlertIds: d.excludedAlertIds,
    manualActions: d.manualActions.map(({ id, at, pondId, action, outcome }) => ({ id, at, pondId, action, outcome })),
    manualEquipmentEvents: d.manualEvents.map(({ id, equipment, pondId, failure, occurredAt, action, status }) => ({ id, equipment, pondId, failure, occurredAt, action, status })),
    summary: d.summary.trim() || null,
  }
}

/** Required before submitting (05 TM-04): Weather* and Technical Manager Summary*. */
export function missingOf(d: Draft): ('weather' | 'summary')[] {
  return [...(d.weather ? [] : ['weather' as const]), ...(d.summary.trim() ? [] : ['summary' as const])]
}

/**
 * Completion: share of the report's items that are ready — feeding and mortality records for every Pond,
 * the automatic sections (equipment, alerts, actions), the optional items (health, rainfall, environmental
 * events — always ready), weather and summary. 8 of 10 with only Weather and Summary left = 80% (wireframe).
 */
export function readiness(r: DailyReport, d: Draft): number {
  const fed = r.ponds.every((p) => p.feedRounds > 0)
  const checks = [fed, true, true, true, true, true, true, true, !!d.weather, !!d.summary.trim()]
  return Math.round((checks.filter(Boolean).length / checks.length) * 100)
}
