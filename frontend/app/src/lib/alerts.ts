import { isSensorParameter } from './params'

type AlertLike = { title: string; parameter: string; direction?: 'below' | 'above' | null }

/**
 * Alert name without the reading — "DO below threshold" — for report tables, which list
 * values only in Pond Detail (wireframe TM-04). Sensor-offline alerts keep their title.
 */
export function alertName(a: AlertLike, t: (key: string, o?: Record<string, unknown>) => string): string {
  if (!a.direction || !isSensorParameter(a.parameter)) return a.title
  return t(`iot.anomaly.${a.direction}_threshold`, { param: t(`paramName.${a.parameter}`) })
}
