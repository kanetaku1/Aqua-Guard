import { describe, expect, it } from 'vitest'
import { formatCalendarDate, formatDate, formatDateTime, formatDue, formatNumber, formatRecentTime, formatTime, formatWeek } from './format'

// Mock "now": 29 Sep 2026 09:35 WIB = 02:35 UTC
const NOW = new Date('2026-09-29T02:35:00Z')

describe('format (WIB)', () => {
  it('converts UTC to WIB (UTC+7)', () => {
    expect(formatTime('2026-09-29T02:35:00Z')).toBe('09:35')
    expect(formatDate('2026-09-28T17:30:00Z')).toBe('29 Sep 2026') // 00:30 WIB on the next day
    expect(formatDateTime('2026-09-29T02:35:00Z')).toBe('29 Sep 2026 09:35')
  })

  it('shows only the time for today and the date otherwise', () => {
    expect(formatRecentTime('2026-09-29T00:50:00Z', NOW)).toBe('07:50')
    expect(formatRecentTime('2026-09-28T15:10:00Z', NOW)).toBe('28 Sep 22:10')
  })

  it('formats deadlines relative to today', () => {
    expect(formatDue('2026-09-29T11:00:00Z', NOW)).toBe('today 18:00')
    expect(formatDue('2026-09-29T16:59:00Z', NOW)).toBe('today')
    expect(formatDue('2026-09-30T11:00:00Z', NOW)).toBe('tomorrow 18:00')
    expect(formatDue('2026-10-02T11:00:00Z', NOW)).toBe('2 Oct 18:00')
  })

  it('formats calendar dates and weeks', () => {
    expect(formatCalendarDate('2026-10-05')).toBe('5 Oct')
    expect(formatWeek('2026-09-22', '2026-09-28')).toBe('22–28 Sep')
    expect(formatWeek('2026-09-29', '2026-10-05')).toBe('29 Sep–5 Oct')
  })

  it('uses comma separators and fixed decimals', () => {
    expect(formatNumber(18900)).toBe('18,900')
    expect(formatNumber(5, 1)).toBe('5.0')
  })
})
