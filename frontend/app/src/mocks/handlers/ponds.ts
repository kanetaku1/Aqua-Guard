import { HttpResponse, http } from 'msw'
import type { SamplingEntry } from '@/api/queries/ponds'
import type { SamplingRecord } from '@/api/types'
import { abwOf, docOn, judgeGrowth, targetAbwAt, vsTargetPct } from '@/lib/growth'
import { NOW, farmALatestSampling, farmAPonds, growthCurve, onTrackBandPct, samplingInputs } from '../data'
import { api, denyFarmAccess, problem } from '../http'
import { judge, store } from '../pondDetail'

/** TM-02 Pond List and weekly sampling (Farm A). The mock plays the backend, so it computes ABW / vs Target. */

export const pondNo = (pondId: string) => Number(pondId.slice(-2))

const initialInputs = structuredClone(samplingInputs)

/** Tests: forget samplings saved by a previous test. */
export function resetSamplings() {
  for (const date of Object.keys(samplingInputs)) delete samplingInputs[date]
  Object.assign(samplingInputs, structuredClone(initialInputs))
}

/** Build a sampling record the way the backend would: DOC, ABW, ADG (vs the previous sampling), vs Target, lab status. */
export function toRecord(date: string, n: number): SamplingRecord {
  const input = samplingInputs[date][n]
  const row = farmAPonds.find((p) => pondNo(p.pond.id) === n)!
  const doc = docOn(row.stockedOn!, date)
  const abw = input.sampleCount && input.sampleWeightG ? abwOf(input.sampleCount, input.sampleWeightG) : null
  const target = targetAbwAt(growthCurve, doc)
  const pct = abw !== null && target ? vsTargetPct(abw, target) : null
  const previous = Object.keys(samplingInputs)
    .filter((d) => d < date && samplingInputs[d][n]?.sampleCount && samplingInputs[d][n]?.sampleWeightG)
    .sort()
    .pop()
  const prevAbw = previous ? abwOf(samplingInputs[previous][n].sampleCount!, samplingInputs[previous][n].sampleWeightG!) : null
  const adg = abw !== null && prevAbw !== null ? Math.round(((abw - prevAbw) / docOn(previous!, date)) * 100) / 100 : null
  const id = `smp-${date}-${n}`
  return {
    ...input,
    date,
    note: store.samplingNotes[id] ?? null,
    id,
    pondId: row.pond.id,
    recordedBy: { id: 'u-sari', name: 'Sari Wijaya' },
    updatedAt: NOW,
    doc,
    abwG: abw,
    adgGPerDay: adg,
    targetAbwG: target,
    vsTargetPct: pct,
    growth: pct === null ? null : judgeGrowth(pct, onTrackBandPct),
    // Lab results are awaited only for the latest sampling; older weeks without lab values were not tested
    labPending: date >= '2026-09-28' && [input.tan, input.no2, input.vibrio, input.alkalinity].every((v) => v == null),
    labSeverity: {
      tan: input.tan == null ? null : judge('tan', input.tan),
      no2: input.no2 == null ? null : judge('no2', input.no2),
      vibrio: input.vibrio == null ? null : judge('vibrio', input.vibrio),
      alkalinity: input.alkalinity == null ? null : judge('alkalinity', input.alkalinity),
    },
  }
}

const recordsOn = (date: string) =>
  Object.keys(samplingInputs[date] ?? {})
    .map(Number)
    .sort((a, b) => a - b)
    .map((n) => toRecord(date, n))

export const pondHandlers = [
  http.get(api('/farms/:farmId/ponds'), ({ params }) => {
    const denied = denyFarmAccess(params.farmId as string, ['technical_manager'])
    return denied ?? HttpResponse.json({ items: farmAPonds, latestSamplingDate: farmALatestSampling })
  }),

  http.get(api('/farms/:farmId/samplings'), ({ params, request }) => {
    const denied = denyFarmAccess(params.farmId as string, ['technical_manager'])
    if (denied) return denied
    const date = new URL(request.url).searchParams.get('date')
    if (!date) return problem(422, 'validation_error', 'date is required')
    return HttpResponse.json({ items: recordsOn(date), growthCurve, onTrackBandPct })
  }),

  http.post(api('/farms/:farmId/samplings/batch'), async ({ params, request }) => {
    const denied = denyFarmAccess(params.farmId as string, ['technical_manager'])
    if (denied) return denied
    const { date, entries } = (await request.json()) as { date: string; entries: SamplingEntry[] }
    const fieldErrors = entries.flatMap((e, i) =>
      (e.sampleCount == null) !== (e.sampleWeightG == null)
        ? [{ field: `entries/${i}/sampleCount`, message: 'Enter both sample count and total weight' }]
        : [],
    )
    if (fieldErrors.length) return problem(422, 'validation_error', 'Invalid sampling', { fieldErrors })
    samplingInputs[date] ??= {}
    for (const { pondId, ...measured } of entries) {
      samplingInputs[date][pondNo(pondId)] = {
        sampleCount: measured.sampleCount ?? null,
        sampleWeightG: measured.sampleWeightG ?? null,
        tan: measured.tan ?? null,
        no2: measured.no2 ?? null,
        vibrio: measured.vibrio ?? null,
        alkalinity: measured.alkalinity ?? null,
      }
    }
    return HttpResponse.json({ items: recordsOn(date) })
  }),
]
