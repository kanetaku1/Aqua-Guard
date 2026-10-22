import { divIcon } from 'leaflet'
import type { GeoPoint } from '@/api/types'
import { cx } from '@/lib/cx'

/** Severity of the Pond, `pick` = the position being edited, `other` = another Pond shown for reference. */
export type MarkerTone = 'normal' | 'attention' | 'warning' | 'critical' | 'pick' | 'other'

const escape = (text: string) => text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)

/** Status-colored dot with the Pond name below it (08 §10 Pond Map). The anchor is the dot's center. */
export function pondIcon(tone: MarkerTone, label?: string) {
  return divIcon({
    className: '',
    iconSize: [0, 0],
    iconAnchor: [0, 0],
    html: `<span class="${cx('pond-marker', `pond-marker--${tone}`)}"><span class="pond-marker-dot"></span>${
      label ? `<span class="pond-marker-label">${escape(label)}</span>` : ''
    }</span>`,
  })
}

export interface LocationText {
  lat: string
  lng: string
}

const fixed = (n: number) => n.toFixed(6)
export const locationText = (p: GeoPoint | null): LocationText => (p ? { lat: fixed(p.lat), lng: fixed(p.lng) } : { lat: '', lng: '' })

/** Both empty = no location; otherwise both must be numbers in range. Error messages are i18n keys. */
export function parseLocation(text: LocationText): { location: GeoPoint | null; errors: { lat?: string; lng?: string } } {
  const lat = text.lat.trim()
  const lng = text.lng.trim()
  if (!lat && !lng) return { location: null, errors: {} }
  const errors: { lat?: string; lng?: string } = {}
  const latN = Number(lat)
  const lngN = Number(lng)
  if (!lat) errors.lat = 'adFarm.ponds.field.bothRequired'
  else if (!Number.isFinite(latN) || Math.abs(latN) > 90) errors.lat = 'adFarm.ponds.field.latRange'
  if (!lng) errors.lng = 'adFarm.ponds.field.bothRequired'
  else if (!Number.isFinite(lngN) || Math.abs(lngN) > 180) errors.lng = 'adFarm.ponds.field.lngRange'
  return { location: errors.lat || errors.lng ? null : { lat: latN, lng: lngN }, errors }
}
