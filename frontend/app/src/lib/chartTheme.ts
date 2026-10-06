/**
 * Recharts colors from the Design System tokens (prototype/assets/tokens.css, 08 §01).
 * Hex values, because SVG presentation attributes cannot read CSS variables — keep in sync with the tokens.
 */
export const chartTheme = {
  primary: '#087EA4', // --color-water-blue: sensor series
  actual: '#2F855A', // --color-mangrove: actuals (growth, feeding)
  muted: '#5B7078', // --color-slate: target lines, axis text
  grid: '#D6E3E5', // --color-tide-line
  band: '#FFF1E6', // --status-warning-bg: out-of-range band
  threshold: '#EC6A0C', // --status-warning-marker: threshold line
  fontSize: 12,
} as const

/** Axis range rounded out to a readable tick step (1, 2, 2.5 or 5 × 10ⁿ), about 4 intervals: DO 4.1–6.6 → 3–7. */
export function niceDomain(values: number[]): [number, number] {
  const finite = values.filter(Number.isFinite)
  if (finite.length === 0) return [0, 1]
  const min = Math.min(...finite)
  const max = Math.max(...finite)
  const span = (max - min || Math.abs(max) || 1) * 1.2
  const raw = span / 4
  const mag = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw)!
  const lo = Math.floor((min - span * 0.1) / step) * step
  const hi = Math.ceil((max + span * 0.1) / step) * step
  return [Number(lo.toFixed(6)), Number(hi.toFixed(6))]
}

/** Evenly spaced ticks inside a nice domain. */
export function niceTicks([lo, hi]: [number, number]): number[] {
  const span = hi - lo
  const mag = 10 ** Math.floor(Math.log10(span / 4))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => span / s <= 5)!
  const ticks: number[] = []
  for (let v = Math.ceil(lo / step) * step; v <= hi + step / 1e6; v += step) ticks.push(Number(v.toFixed(6)))
  return ticks
}
