/* eslint-disable react/only-export-components -- a test double, never hot-reloaded */
import type { ReactNode } from 'react'

/**
 * jsdom cannot lay out Leaflet maps, so tests render react-leaflet as plain elements (see setup.ts):
 * a Marker is a button named by its `title` (click = Leaflet click), a Tooltip is its content, and
 * `clickMap()` / `dragMarker()` stand in for the pointer on the map.
 */
type Handlers = Record<string, (e: unknown) => void>
type LatLng = { lat: number; lng: number }

let mapHandlers: Handlers = {}
const dragEnds: ((to: LatLng) => void)[] = []

export function clickMap(latlng: LatLng) {
  mapHandlers.click?.({ latlng })
}

/** Drags the (only) draggable marker to `to`. */
export function dragMarker(to: LatLng) {
  dragEnds.at(-1)?.(to)
}

const stubMap = { setView() {}, fitBounds() {}, invalidateSize() {}, getContainer: () => document.createElement('div') }

export function MapContainer({ children }: { children?: ReactNode }) {
  return <div data-testid="leaflet-map">{children}</div>
}

export const TileLayer = () => null

export const useMap = () => stubMap

export function useMapEvents(handlers: Handlers) {
  mapHandlers = handlers
  return stubMap
}

export function Marker({
  position,
  title,
  draggable,
  eventHandlers,
  children,
}: {
  position: [number, number]
  title?: string
  draggable?: boolean
  eventHandlers?: Handlers
  children?: ReactNode
}) {
  if (draggable && eventHandlers?.dragend) {
    const dragend = eventHandlers.dragend
    dragEnds.push((to) => dragend({ target: { getLatLng: () => to } }))
  }
  return (
    <div data-testid="leaflet-marker" data-position={position.join(',')} data-draggable={draggable ? 'true' : undefined}>
      {title && (
        <button type="button" onClick={() => eventHandlers?.click?.({})}>
          {title}
        </button>
      )}
      {children}
    </div>
  )
}

export function Tooltip({ children }: { children?: ReactNode }) {
  return <div role="tooltip">{children}</div>
}
