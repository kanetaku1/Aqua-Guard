import { describe, expect, it } from 'vitest'
import { niceDomain, niceTicks } from './chartTheme'

describe('chart axis', () => {
  it('rounds the range out to a readable step', () => {
    expect(niceDomain([4.1, 6.6, 4.5])).toEqual([3, 7]) // DO 24h (prototype axis 3–7)
    expect(niceDomain([4.1, 4.6, 4.5])).toEqual([4, 4.8]) // alert drawer, last 8 h
    expect(niceDomain([18000, 18900, 15000, 25000])).toEqual([10000, 30000]) // TDS with Warning limits
  })

  it('places evenly spaced ticks', () => {
    expect(niceTicks([3, 7])).toEqual([3, 4, 5, 6, 7])
    expect(niceTicks([4, 4.8])).toEqual([4, 4.2, 4.4, 4.6, 4.8])
    expect(niceTicks([10000, 30000])).toEqual([10000, 15000, 20000, 25000, 30000])
  })
})
