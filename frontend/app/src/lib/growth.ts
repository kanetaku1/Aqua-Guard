import { differenceInCalendarDays, parseISO } from 'date-fns'
import type { components } from '@/api/schema'

type GrowthTargetPoint = components['schemas']['GrowthTargetPoint']
type GrowthJudgement = components['schemas']['GrowthJudgement']

/**
 * Input preview for the weekly sampling form only (04 §3, §5). Saved ABW / vs Target are always
 * the backend's values; this lets the Technical Manager check an entry while typing.
 */

/** DOC on a given date = date − stocking date. */
export const docOn = (stockedOn: string, date: string) => differenceInCalendarDays(parseISO(date), parseISO(stockedOn))

/** ABW (g) = total sample weight ÷ sample count, 1 decimal. */
export const abwOf = (count: number, weightG: number) => Math.round((weightG / count) * 10) / 10

/** Target ABW at a DOC: linear between curve points, extended from the nearest segment outside the curve. */
export function targetAbwAt(curve: GrowthTargetPoint[], doc: number): number | null {
  const pts = [...curve].sort((a, b) => a.doc - b.doc)
  if (pts.length === 0) return null
  if (pts.length === 1) return pts[0].targetAbwG
  let i = pts.findIndex((p) => p.doc >= doc)
  if (i <= 0) i = i === 0 ? 1 : pts.length - 1
  const a = pts[i - 1]
  const b = pts[i]
  const value = a.targetAbwG + ((doc - a.doc) * (b.targetAbwG - a.targetAbwG)) / (b.doc - a.doc)
  return Math.round(value * 10) / 10
}

/** vs Target (%) = ABW ÷ target − 1, integer. */
export const vsTargetPct = (abw: number, target: number) => Math.round((abw / target - 1) * 100)

/** Behind ≤ −band, Ahead ≥ +band, otherwise On track (band = On track width, default 5 %). */
export function judgeGrowth(pct: number, bandPct = 5): GrowthJudgement {
  if (pct <= -bandPct) return 'behind'
  if (pct >= bandPct) return 'ahead'
  return 'on_track'
}
