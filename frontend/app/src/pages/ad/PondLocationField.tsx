import type { Marker as LeafletMarker } from 'leaflet'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Marker, useMapEvents } from 'react-leaflet'
import type { GeoPoint } from '@/api/types'
import { PondMap } from '@/components/PondMap'
import { cx } from '@/lib/cx'
import { locationText, parseLocation, pondIcon, type LocationText } from '@/lib/pondMap'

function PickOnClick({ onPick }: { onPick: (p: GeoPoint) => void }) {
  useMapEvents({ click: (e) => onPick({ lat: e.latlng.lat, lng: e.latlng.lng }) })
  return null
}

/**
 * Location of the Pond (AD-F-004, 08 §10 Pond Map): click the map to place it, drag the pin, or type the coordinates.
 * The other located Ponds of the Farm are shown in grey for reference.
 */
export function PondLocationField({
  value,
  onChange,
  others,
  errors,
}: {
  value: LocationText
  onChange: (value: LocationText) => void
  others: { id: string; name: string; location: GeoPoint }[]
  errors: { lat?: string; lng?: string }
}) {
  const { t } = useTranslation()
  const { location } = parseLocation(value)
  // Framed once when the drawer opens, so placing the pin does not move the map
  const [initial] = useState(() => (location ? [location] : others.map((o) => o.location)))
  const pickIcon = useMemo(() => pondIcon('pick'), [])
  const set = (p: GeoPoint) => onChange(locationText(p))

  return (
    <div className="field">
      <span className="field-label">
        <span>{t('adFarm.ponds.field.location')}</span>
        {(value.lat || value.lng) && (
          <button type="button" className="btn btn--link btn--sm" onClick={() => onChange(locationText(null))}>
            {t('adFarm.ponds.clearLocation')}
          </button>
        )}
      </span>
      <span className="helper">{t('adFarm.ponds.field.locationHelp')}</span>
      <PondMap points={initial} small label={t('adFarm.ponds.mapLabel')}>
        <PickOnClick onPick={set} />
        {others.map((o) => (
          <Marker key={o.id} position={[o.location.lat, o.location.lng]} icon={pondIcon('other', o.name)} keyboard={false} interactive={false} />
        ))}
        {location && (
          <Marker
            position={[location.lat, location.lng]}
            icon={pickIcon}
            draggable
            eventHandlers={{ dragend: (e) => set((e.target as LeafletMarker).getLatLng()) }}
          />
        )}
      </PondMap>
      <div className="form-grid">
        {(['lat', 'lng'] as const).map((axis) => (
          <label key={axis} className="field">
            <span className="field-label">{t(`adFarm.ponds.field.${axis}`)}</span>
            <input
              className={cx('input', errors[axis] && 'is-error')}
              inputMode="decimal"
              placeholder={axis === 'lat' ? '-6.259871' : '106.644181'}
              value={value[axis]}
              onChange={(e) => onChange({ ...value, [axis]: e.target.value })}
            />
            {errors[axis] && <span className="helper is-error">{errors[axis]}</span>}
          </label>
        ))}
      </div>
    </div>
  )
}
