import 'leaflet/dist/leaflet.css'
import { latLngBounds, type LatLngExpression } from 'leaflet'
import { useEffect, type ReactNode } from 'react'
import { MapContainer, TileLayer, useMap } from 'react-leaflet'
import type { GeoPoint } from '@/api/types'
import { cx } from '@/lib/cx'

const SINGLE_ZOOM = 17
const WORLD: { center: LatLngExpression; zoom: number } = { center: [-2.5, 118], zoom: 5 } // Indonesia

/** Shows every point; a single point is centered at Pond scale. Refits only when the set of points changes. */
function FitPoints({ points }: { points: GeoPoint[] }) {
  const map = useMap()
  // Refit only when the points themselves change, not on every 5-minute refetch
  const key = points.map((p) => `${p.lat},${p.lng}`).join(';')
  useEffect(() => {
    const coords = key ? key.split(';').map((pair) => pair.split(',').map(Number) as [number, number]) : []
    if (coords.length === 1) map.setView(coords[0], SINGLE_ZOOM)
    else if (coords.length > 1) map.fitBounds(latLngBounds(coords), { padding: [48, 48], maxZoom: SINGLE_ZOOM })
  }, [map, key])
  // The map measures its box once; remeasure when it is laid out late (drawer opening, window resize)
  useEffect(() => {
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => map.invalidateSize())
    observer.observe(map.getContainer())
    return () => observer.disconnect()
  }, [map])
  return null
}

/** OpenStreetMap base map for Pond positions (07 §7 Pond Map). Markers are passed as children. */
export function PondMap({ points, small, label, children }: { points: GeoPoint[]; small?: boolean; label: string; children?: ReactNode }) {
  return (
    <div className={cx('pond-map', small && 'pond-map--sm')} role="region" aria-label={label}>
      <MapContainer center={WORLD.center} zoom={WORLD.zoom} scrollWheelZoom={false}>
        <TileLayer
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          maxZoom={19}
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        />
        <FitPoints points={points} />
        {children}
      </MapContainer>
    </div>
  )
}
