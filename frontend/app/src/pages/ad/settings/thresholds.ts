import type { components } from '@/api/schema'

type Threshold = components['schemas']['Threshold']
export const BOUNDARIES = ['criticalLow', 'warningLow', 'attentionLow', 'attentionHigh', 'warningHigh', 'criticalHigh'] as const
export type Boundary = (typeof BOUNDARIES)[number]
export type Level = 'critical' | 'warning' | 'attention' | 'normal'
export const LOW: Boundary[] = ['criticalLow', 'warningLow', 'attentionLow']
export const HIGH: Boundary[] = ['attentionHigh', 'warningHigh', 'criticalHigh']
export const levelOf = (b: Boundary): Level => b.replace(/Low|High/, '') as Level

/** One editor row: the inputs are kept as typed ("15,000"); `inherited` = a Farm row that follows the default. */
export type DraftRow = { parameter: Threshold['parameter']; unit: string; sides: NonNullable<Threshold['sides']>; inherited: boolean; values: Record<Boundary, string> }

/** Decimals shown for each parameter (DO, pH, TAN, NO2 keep one decimal: "5.0"); the others show what is needed (24, 26.5, 15,000). */
const FIXED: Partial<Record<string, number>> = { do: 1, ph: 1, tan: 1, no2: 1 }
export function formatBoundary(parameter: string, v: number): string {
  const fixed = FIXED[parameter]
  return v.toLocaleString('en-US', { minimumFractionDigits: fixed ?? 0, maximumFractionDigits: fixed ?? 2 })
}

export function toDraft(t: Threshold): DraftRow {
  return {
    parameter: t.parameter,
    unit: t.unit ?? '',
    sides: t.sides ?? 'both',
    inherited: !!t.inherited,
    values: Object.fromEntries(BOUNDARIES.map((b) => [b, t[b] === null || t[b] === undefined ? '' : formatBoundary(t.parameter, t[b]!)])) as Record<Boundary, string>,
  }
}

/** "" → null (Not used); "15,000" → 15000; anything else that is not a number → NaN. */
export function parse(raw: string): number | null {
  const s = raw.replace(/,/g, '').trim()
  if (!s) return null
  return /^-?\d+(\.\d+)?$/.test(s) ? Number(s) : NaN
}

export const toThreshold = (r: DraftRow): Threshold => ({
  parameter: r.parameter,
  unit: r.unit,
  ...(Object.fromEntries(BOUNDARIES.map((b) => [b, parse(r.values[b])])) as Record<Boundary, number | null>),
})

export const editable = (r: DraftRow, b: Boundary) => (LOW.includes(b) ? r.sides !== 'high' : r.sides !== 'low')

type T = (key: string, o?: Record<string, unknown>) => string

/**
 * Field errors for one row (04 §6.2): values move away from Normal — on the low side Critical < Warning < Attention,
 * on the high side Attention < Warning < Critical — and the low side stays below the high side.
 * Message on the out-of-order field, e.g. "Warning (8.4) must be above Attention (8.5)."
 */
export function rowErrors(r: DraftRow, t: T): Partial<Record<Boundary, string>> {
  const errors: Partial<Record<Boundary, string>> = {}
  const name = (b: Boundary) => t(`severity.${levelOf(b)}`)
  for (const b of BOUNDARIES) if (Number.isNaN(parse(r.values[b]))) errors[b] = t('adSettings.thresholds.notNumber', { name: name(b) })
  const check = (side: Boundary[], direction: 'below' | 'above') => {
    // Inner (next to Normal) first
    const inner = direction === 'below' ? [...side].reverse() : side
    const present = inner.filter((b) => editable(r, b) && parse(r.values[b]) !== null && !Number.isNaN(parse(r.values[b])))
    for (let i = 1; i < present.length; i++) {
      const [prev, cur] = [present[i - 1], present[i]]
      const ok = direction === 'below' ? parse(r.values[cur])! < parse(r.values[prev])! : parse(r.values[cur])! > parse(r.values[prev])!
      if (!ok && !errors[cur]) {
        errors[cur] = t(`adSettings.thresholds.must_${direction}`, { name: name(cur), value: r.values[cur], other: name(prev), otherValue: r.values[prev] })
      }
    }
    return present[0]
  }
  const innerLow = check(LOW, 'below')
  const innerHigh = check(HIGH, 'above')
  if (innerLow && innerHigh && !(parse(r.values[innerHigh])! > parse(r.values[innerLow])!) && !errors[innerHigh]) {
    errors[innerHigh] = t('adSettings.thresholds.overlap', { value: r.values[innerHigh], low: r.values[innerLow] })
  }
  return errors
}

/** Normal range shown in the middle: "7.5 – 8.5", "≥ 5.0", "≤ 1.0" (between the innermost boundaries). */
export function normalText(r: DraftRow): string {
  const low = [...LOW].reverse().find((b) => editable(r, b) && parse(r.values[b]) !== null)
  const high = HIGH.find((b) => editable(r, b) && parse(r.values[b]) !== null)
  const f = (b: Boundary) => formatBoundary(r.parameter, parse(r.values[b])!)
  if (low && high) return `${f(low)} – ${f(high)}`
  if (low) return `≥ ${f(low)}`
  if (high) return `≤ ${f(high)}`
  return '—'
}

/**
 * Range preview under a row: coloured segments from the lowest to the highest status, and the boundary ticks.
 * Widths are % of a domain padded around the boundaries; a one-sided parameter gets room on its Normal side.
 */
export function scaleOf(r: DraftRow): { segments: { level: Level; width: number }[]; ticks: { left: number; label: string }[] } | null {
  const valid = (b: Boundary) => editable(r, b) && parse(r.values[b]) !== null && !Number.isNaN(parse(r.values[b]))
  const low = LOW.filter(valid).map((b) => ({ b, v: parse(r.values[b])! }))
  const high = HIGH.filter(valid).map((b) => ({ b, v: parse(r.values[b])! }))
  const all = [...low, ...high].map((x) => x.v)
  if (all.length === 0) return null
  const min = Math.min(...all)
  const max = Math.max(...all)
  const span = max - min || Math.abs(max) || 1
  const pad = span * (low.length && high.length ? 0.25 : 0.5)
  const from = high.length && !low.length ? Math.max(0, min - span) : min - pad
  const to = low.length && !high.length ? max + span : max + pad
  const pos = (v: number) => ((v - from) / (to - from)) * 100

  // Ascending regions: below each low boundary its own status, above each high boundary its own status
  const edges = [...low.map((x) => ({ v: x.v, below: levelOf(x.b), above: null as Level | null })), ...high.map((x) => ({ v: x.v, below: null as Level | null, above: levelOf(x.b) }))].sort(
    (a, b) => a.v - b.v,
  )
  const segments: { level: Level; width: number }[] = []
  let start = from
  let level: Level = edges[0].below ?? 'normal'
  for (const e of edges) {
    segments.push({ level: e.below ?? level, width: Math.max(0, pos(e.v) - pos(start)) })
    level = e.above ?? 'normal'
    start = e.v
  }
  segments.push({ level, width: Math.max(0, 100 - pos(start)) })
  return {
    segments: segments.filter((s) => s.width > 0),
    ticks: [...low, ...high].sort((a, b) => a.v - b.v).map((x) => ({ left: pos(x.v), label: formatBoundary(r.parameter, x.v) })),
  }
}

export const changedCells = (draft: DraftRow[], saved: DraftRow[]) =>
  draft.reduce((n, r, i) => n + BOUNDARIES.filter((b) => parse(r.values[b]) !== parse(saved[i]?.values[b] ?? '')).length + (r.inherited !== saved[i]?.inherited && r.inherited ? 1 : 0), 0)
