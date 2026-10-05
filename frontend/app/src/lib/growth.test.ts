import { describe, expect, it } from 'vitest'
import { abwOf, docOn, judgeGrowth, targetAbwAt, vsTargetPct } from './growth'

// 04 §5 sample curve
const CURVE = [
  { doc: 27, targetAbwG: 5.3 },
  { doc: 34, targetAbwG: 7.4 },
  { doc: 41, targetAbwG: 9.5 },
  { doc: 48, targetAbwG: 11.5 },
  { doc: 55, targetAbwG: 13.3 },
  { doc: 62, targetAbwG: 15.0 },
  { doc: 69, targetAbwG: 16.6 },
  { doc: 76, targetAbwG: 18.2 },
]

describe('growth preview (04 §3, §5)', () => {
  it('interpolates and extrapolates the target curve (mock_data.md: DOC 82 / 68 / 75 = 19.6 / 16.4 / 18.0 g)', () => {
    expect(targetAbwAt(CURVE, 82)).toBe(19.6)
    expect(targetAbwAt(CURVE, 68)).toBe(16.4)
    expect(targetAbwAt(CURVE, 75)).toBe(18.0)
    expect(targetAbwAt(CURVE, 27)).toBe(5.3)
    expect(targetAbwAt(CURVE, 20)).toBe(3.2)
  })

  it('computes DOC, ABW, vs Target and the judgement', () => {
    expect(docOn('2026-07-15', '2026-10-05')).toBe(82)
    expect(abwOf(100, 1930)).toBe(19.3)
    expect(vsTargetPct(19.3, 19.6)).toBe(-2)
    expect(vsTargetPct(14.8, 16.4)).toBe(-10)
    expect(judgeGrowth(-5)).toBe('behind')
    expect(judgeGrowth(-4)).toBe('on_track')
    expect(judgeGrowth(5)).toBe('ahead')
  })
})
