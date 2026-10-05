import { TZDate } from '@date-fns/tz'
import { format, isSameDay, parseISO } from 'date-fns'
import { now } from './clock'

/** All times are shown in WIB (UTC+7), dates as "29 Sep 2026" (04 §6.1). */
export const WIB = 'Asia/Jakarta'

const inWib = (value: string | Date) => new TZDate(new Date(value).getTime(), WIB)

/** UTC date-time → "29 Sep 2026" in WIB. */
export const formatDate = (iso: string) => format(inWib(iso), 'd MMM yyyy')

/** UTC date-time → "28 Sep" in WIB. */
export const formatDayMonth = (iso: string) => format(inWib(iso), 'd MMM')

/** UTC date-time → "09:35" in WIB. */
export const formatTime = (iso: string) => format(inWib(iso), 'HH:mm')

/** UTC date-time → "29 Sep 2026 09:35" in WIB. */
export const formatDateTime = (iso: string) => format(inWib(iso), 'd MMM yyyy HH:mm')

/** Same WIB day as now → "07:50", otherwise "28 Sep 22:10". */
export function formatRecentTime(iso: string, reference: Date = now()): string {
  const t = inWib(iso)
  return isSameDay(t, inWib(reference)) ? format(t, 'HH:mm') : format(t, 'd MMM HH:mm')
}

/** Deadline: "today 18:00", "tomorrow 18:00" or "30 Sep 18:00". A 23:59 deadline drops the time ("today"). */
export function formatDue(iso: string, reference: Date = now()): string {
  const t = inWib(iso)
  const ref = inWib(reference)
  const tomorrow = new TZDate(ref.getTime() + 86_400_000, WIB)
  const day = isSameDay(t, ref) ? 'today' : isSameDay(t, tomorrow) ? 'tomorrow' : format(t, 'd MMM')
  const time = format(t, 'HH:mm')
  return time === '23:59' ? day : `${day} ${time}`
}

/** WIB calendar date "2026-09-29" → "29 Sep" (pattern can be overridden). */
export const formatCalendarDate = (date: string, pattern = 'd MMM') => format(parseISO(date), pattern)

/** "2026-09-22" + "2026-09-28" → "22–28 Sep" (or "29 Sep–5 Oct"). */
export function formatWeek(start: string, end: string): string {
  const s = parseISO(start)
  const e = parseISO(end)
  return s.getMonth() === e.getMonth() ? `${format(s, 'd')}–${format(e, 'd MMM')}` : `${format(s, 'd MMM')}–${format(e, 'd MMM')}`
}

/** Comma thousands separator, fixed decimals. */
export function formatNumber(value: number, digits = 0): string {
  return value.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })
}

/** Today's WIB calendar date, "2026-09-29". */
export const todayInWib = (reference: Date = now()) => format(inWib(reference), 'yyyy-MM-dd')

/** Signed integer percent with a true minus sign: "−8%", "+2%", "0%". */
export function formatSignedPct(pct: number): string {
  const n = Math.round(pct)
  return `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n)}%`
}

/** UTC date-time → "29 Sep 09:35" in WIB. */
export const formatDayTime = (iso: string) => format(inWib(iso), 'd MMM HH:mm')

/** Elapsed time: "45 min", "1 h 45 min", "6 h 05 min", "26 h" (minutes dropped from 10 h, hours up to 48 h), "2 days". */
export function formatDuration(fromIso: string, toIso: string | Date = now()): string {
  const minutes = Math.max(0, Math.round((new Date(toIso).getTime() - new Date(fromIso).getTime()) / 60_000))
  if (minutes < 60) return `${minutes} min`
  if (minutes < 48 * 60) {
    const h = Math.floor(minutes / 60)
    const m = minutes % 60
    return m && h < 10 ? `${h} h ${String(m).padStart(2, '0')} min` : `${h} h`
  }
  const days = Math.floor(minutes / (24 * 60))
  return days === 1 ? '1 day' : `${days} days`
}

/** How long an Issue has lasted, in whole units (FM wireframe): "45 min", "1 hr", "8 hrs", "3 days". */
export function formatElapsed(fromIso: string, toIso: string | Date = now()): string {
  const minutes = Math.max(0, Math.round((new Date(toIso).getTime() - new Date(fromIso).getTime()) / 60_000))
  if (minutes < 60) return `${minutes} min`
  const hours = Math.round(minutes / 60) // 3 h 55 min → "4 hrs"
  if (hours < 24) return hours === 1 ? '1 hr' : `${hours} hrs`
  const days = Math.floor(minutes / (24 * 60))
  return days <= 1 ? '1 day' : `${days} days`
}

/** WIB calendar day → [start, end) as UTC ISO strings. */
export function wibDayRange(date: string): [string, string] {
  const start = new Date(`${date}T00:00:00+07:00`)
  return [start.toISOString(), new Date(start.getTime() + 86_400_000).toISOString()]
}

/** WIB date + "HH:mm" → UTC ISO. */
export const wibDateTimeToIso = (date: string, time: string) => new Date(`${date}T${time}:00+07:00`).toISOString()

/** Threshold / range values without trailing zeros: 26 → "26", 4.5 → "4.5", 15000 → "15,000". */
export const formatLimit = (v: number) => formatNumber(v, Number.isInteger(v) ? 0 : 1)

/** Report period: "22–28 Sep 2026" / "29 Sep–5 Oct 2026". */
export const formatPeriod = (start: string, end: string) =>
  `${formatCalendarDate(start, start.slice(5, 7) === end.slice(5, 7) ? 'd' : 'd MMM')}–${formatCalendarDate(end, 'd MMM yyyy')}`
