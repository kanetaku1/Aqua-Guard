import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { chartTheme as C, niceTicks } from '@/lib/chartTheme'

/**
 * Charts (08 Chart; same look as prototype/assets/charts.js): horizontal grid only, unit above the y-axis,
 * out-of-range band + dashed threshold line, no animation.
 */

const tick = { fontSize: C.fontSize, fill: C.muted, fontFamily: 'Inter, sans-serif' }

export type SeriesPoint = { label: string; value: number | null }

export function TimeSeriesChart({
  data,
  unit,
  domain,
  bands = [],
  thresholds = [],
  height = 260,
  digits = 1,
}: {
  data: SeriesPoint[]
  unit: string
  domain: [number, number]
  bands?: [number, number][]
  thresholds?: { value: number; label: string }[]
  height?: number
  digits?: number
}) {
  return (
    <div className="chart" style={{ height, flexShrink: 0 }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: unit ? 26 : 12, right: 16, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke={C.grid} />
          {bands.map(([from, to]) => (
            <ReferenceArea key={`${from}-${to}`} y1={from} y2={to} fill={C.band} fillOpacity={1} ifOverflow="hidden" />
          ))}
          {thresholds.map((th) => (
            <ReferenceLine
              key={th.value}
              y={th.value}
              stroke={C.threshold}
              strokeDasharray="4 3"
              label={{ value: th.label, position: 'insideBottomRight', fill: C.threshold, fontSize: C.fontSize }}
            />
          ))}
          <XAxis dataKey="label" tick={tick} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={28} />
          <YAxis
            domain={domain}
            tick={tick}
            tickLine={false}
            axisLine={false}
            width={44}
            ticks={niceTicks(domain)}
            allowDecimals
            tickFormatter={(v: number) => v.toLocaleString('en-US', { maximumFractionDigits: 1 })}
            label={unit ? { value: `(${unit})`, position: 'top', offset: 12, fontSize: 10, fill: C.muted } : undefined}
          />
          <Tooltip
            formatter={(v) => [`${Number(v).toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })} ${unit}`, '']}
            separator=""
            labelStyle={{ fontWeight: 700 }}
          />
          <Line type="linear" dataKey="value" stroke={C.primary} strokeWidth={2} dot={false} isAnimationActive={false} connectNulls={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

/** Pond growth: target curve (dashed) and sampled ABW (points) by DOC. */
export function GrowthChart({
  target,
  actual,
  height = 180,
}: {
  target: { doc: number; value: number }[]
  actual: { doc: number; value: number }[]
  height?: number
}) {
  const docs = [...new Set([...target.map((p) => p.doc), ...actual.map((p) => p.doc)])].sort((a, b) => a - b)
  const data = docs.map((doc) => ({
    doc,
    target: target.find((p) => p.doc === doc)?.value ?? null,
    actual: actual.find((p) => p.doc === doc)?.value ?? null,
  }))
  const max = Math.max(...data.flatMap((d) => [d.target ?? 0, d.actual ?? 0]))
  return (
    <div className="chart" style={{ height, flexShrink: 0 }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 26, right: 16, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke={C.grid} />
          <XAxis
            dataKey="doc"
            type="number"
            domain={['dataMin', 'dataMax']}
            ticks={docs}
            tick={tick}
            tickLine={false}
            axisLine={false}
            tickFormatter={(d: number) => `DOC ${d}`}
          />
          <YAxis
            domain={[0, Math.ceil(max / 4) * 4]}
            tick={tick}
            tickLine={false}
            axisLine={false}
            width={44}
            tickCount={5}
            label={{ value: '(g)', position: 'top', offset: 12, fontSize: 10, fill: C.muted }}
          />
          <Tooltip formatter={(v, name) => [`${Number(v).toFixed(1)} g`, name === 'actual' ? 'Actual' : 'Target']} labelFormatter={(d) => `DOC ${d}`} />
          <Line dataKey="target" stroke={C.muted} strokeWidth={1.5} strokeDasharray="5 4" dot={false} connectNulls isAnimationActive={false} />
          <Line
            dataKey="actual"
            stroke={C.actual}
            strokeWidth={2}
            dot={{ r: 3, fill: '#fff', stroke: C.actual, strokeWidth: 2 }}
            connectNulls
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

export type GrowthPoint = { doc: number; abw: number; label: string; behind: boolean }

/**
 * Growth vs Target (07 §11.4): the target ABW curve by DOC with the On track band (±band %), and each Pond's
 * ABW as a labelled point. Ponds have different DOC, so no averaged line is drawn (04 §4).
 */
export function GrowthVsTargetChart({
  curve,
  points,
  bandPct = 5,
  height = 400,
  tickStep = 14,
}: {
  curve: { doc: number; targetAbwG: number }[]
  points: GrowthPoint[]
  bandPct?: number
  height?: number
  /** DOC between x-axis ticks: 14 in narrow cards, 7 in a full-width card (FM-03 wireframe) */
  tickStep?: number
}) {
  const docs = [...curve.map((c) => c.doc), ...points.map((p) => p.doc)]
  const xMin = Math.max(0, Math.min(...docs) - 7)
  const xMax = Math.max(...docs) + 7
  // Draw the target line from the left edge of the axis (wireframe): extend the first segment back to xMin
  const [c0, c1] = curve
  const lead = c0 && c1 && xMin < c0.doc ? [{ doc: xMin, targetAbwG: Math.max(0, c0.targetAbwG - ((c1.targetAbwG - c0.targetAbwG) / (c1.doc - c0.doc)) * (c0.doc - xMin)) }] : []
  const target = [...lead, ...curve].map((c) => ({ doc: c.doc, target: c.targetAbwG, band: [c.targetAbwG * (1 - bandPct / 100), c.targetAbwG * (1 + bandPct / 100)] }))
  const yMax = Math.ceil(Math.max(...curve.map((c) => c.targetAbwG * 1.05), ...points.map((p) => p.abw)) / 5) * 5
  const ticks: number[] = []
  for (let d = xMin; d <= xMax; d += tickStep) ticks.push(d)

  // Ponds at the same DOC: put the lower point's label below it so labels do not overlap
  const renderPoint = (props: { cx?: number; cy?: number; payload?: GrowthPoint }) => {
    const { cx = 0, cy = 0, payload } = props
    if (!payload) return <g />
    const twins = points.filter((q) => q.doc === payload.doc)
    const below = twins.length > 1 && payload.abw === Math.min(...twins.map((q) => q.abw))
    const color = payload.behind ? C.threshold : C.actual
    return (
      <g>
        <circle cx={cx} cy={cy} r={5} fill={color} stroke="#fff" strokeWidth={1.5} />
        <text x={cx} y={cy + (below ? 18 : -9)} textAnchor="middle" fontSize={C.fontSize} fontWeight={700} fontFamily="Inter, sans-serif" fill={payload.behind ? C.threshold : '#18323B'}>
          {payload.label}
        </text>
      </g>
    )
  }

  return (
    <div className="chart" style={{ height, flexShrink: 0 }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={target} margin={{ top: 26, right: 16, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke={C.grid} />
          <XAxis dataKey="doc" type="number" domain={[xMin, xMax]} ticks={ticks} tick={tick} tickLine={false} axisLine={false} tickFormatter={(d: number) => `DOC ${d}`} />
          <YAxis
            domain={[0, yMax]}
            ticks={niceTicks([0, yMax])}
            tick={tick}
            tickLine={false}
            axisLine={false}
            width={44}
            label={{ value: '(g)', position: 'top', offset: 12, fontSize: 10, fill: C.muted }}
          />
          <Area dataKey="band" stroke="none" fill="#EDF4F2" fillOpacity={1} isAnimationActive={false} />
          <Line dataKey="target" stroke={C.muted} strokeWidth={1.5} strokeDasharray="5 4" dot={false} isAnimationActive={false} />
          {/* An empty `data` would make Recharts fall back to the curve data, so draw no Scatter without points (AD-04 curve only) */}
          {points.length > 0 && <Scatter data={points} dataKey="abw" shape={renderPoint} isAnimationActive={false} />}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}

/** Donut palettes — one hue per measure, dark → light by value (07 §11.4; prototype charts.js). */
const DONUT = {
  feed: ['#1F5A40', '#27684F', '#2F855A', '#4A9571', '#66A788', '#82B99F', '#9ECAB6', '#BAD9CB', '#D1E6DC', '#E4F0EA'],
  mortality: ['#2C3F46', '#364E56', '#4A5F67', '#5B7078', '#6F8289', '#84959B', '#9AA8AD', '#B0BCC0', '#C7D0D3', '#DDE3E5'],
}

/** Share of a weekly Farm total by Pond: every Pond, largest first, no "Others"; total in the centre. */
export function Donut({ items, unit, palette, caption }: { items: { name: string; value: number }[]; unit: string; palette: keyof typeof DONUT; caption: string }) {
  const sorted = [...items].sort((a, b) => b.value - a.value)
  const total = sorted.reduce((s, i) => s + i.value, 0)
  const S = 160
  const R = 60
  const SW = 24
  const c = S / 2
  const circ = 2 * Math.PI * R
  const lengths = sorted.map((item) => (total ? (item.value / total) * circ : 0))
  const offsets = lengths.map((_, k) => lengths.slice(0, k).reduce((a, b) => a + b, 0))
  return (
    <div className="donut">
      <svg width={S} height={S} viewBox={`0 0 ${S} ${S}`} role="img" aria-label={`${total.toLocaleString('en-US')} ${caption}`}>
        {sorted.map((item, k) => {
          const len = lengths[k]
          return (
            <circle
              key={item.name}
              cx={c}
              cy={c}
              r={R}
              fill="none"
              stroke={DONUT[palette][k % DONUT[palette].length]}
              strokeWidth={SW}
              strokeDasharray={`${Math.max(0, len - 1.5).toFixed(2)} ${(circ - len + 1.5).toFixed(2)}`}
              strokeDashoffset={(-offsets[k]).toFixed(2)}
              transform={`rotate(-90 ${c} ${c})`}
            />
          )
        })}
        <text x={c} y={c + 2} textAnchor="middle" fontFamily="Inter, sans-serif" fontSize={20} fontWeight={700} fill="#18323B">
          {total.toLocaleString('en-US')}
        </text>
        <text x={c} y={c + 20} textAnchor="middle" fontFamily="Inter, sans-serif" fontSize={12} fill={C.muted}>
          {caption}
        </text>
      </svg>
      <ul className={`donut-legend${sorted.length > 5 ? ' is-compact' : ''}`}>
        {sorted.map((item, k) => (
          <li key={item.name}>
            <span className="donut-swatch" style={{ background: DONUT[palette][k % DONUT[palette].length] }} />
            <span className="donut-name">{item.name}</span>
            <span className="num">
              {item.value.toLocaleString('en-US')} {unit}
            </span>
            <span className="num text-muted">{total ? Math.round((item.value / total) * 100) : 0}%</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
