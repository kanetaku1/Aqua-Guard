import { Droplets, Fan, Info, Plus, Radio } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router'
import { isApiError } from '@/api/client'
import { useAdminDevices, useAdminPonds, useSaveDevice } from '@/api/queries/admin'
import type { components } from '@/api/schema'
import { Pagination } from '@/components/Controls'
import { Drawer } from '@/components/Drawer'
import { Icon } from '@/components/Icon'
import { QueryState } from '@/components/QueryState'
import { cx } from '@/lib/cx'
import { formatDayTime, formatRecentTime } from '@/lib/format'
import { PARAM_ICON, SENSOR_PARAMS, UNIT } from '@/lib/params'
import { fieldError } from './fieldError'

type S = components['schemas']
type Device = S['AdminDevice']
const TYPES: S['DeviceType'][] = ['sensor', 'aerator', 'pump']
const CONNECTIONS: S['Connection'][] = ['online', 'offline']
const PAGE_SIZE = 20

/**
 * Devices (AD-F-005): sensors and actuators assigned to the Ponds. Filters in `?pond= &type= &connection=`,
 * `?device=<id>|new` opens the drawer. Device values are never shown here — monitoring is in the TM screens.
 */
export function DevicesTab({ farm, onDone }: { farm: S['AdminFarm']; onDone: (message: string) => void }) {
  const { t } = useTranslation()
  const [params, setParams] = useSearchParams()
  const [page, setPage] = useState(1)
  const pondId = params.get('pond') || undefined
  const type = (TYPES as string[]).includes(params.get('type') ?? '') ? (params.get('type') as S['DeviceType']) : undefined
  const connection = (CONNECTIONS as string[]).includes(params.get('connection') ?? '') ? (params.get('connection') as S['Connection']) : undefined
  const devices = useAdminDevices(farm.id, { pondId, type, connection, page, pageSize: PAGE_SIZE })
  const offline = useAdminDevices(farm.id, { connection: 'offline', page: 1, pageSize: 100 })
  const ponds = useAdminPonds(farm.id)
  const editing = params.get('device')

  const setParam = (key: string, value: string | null, replace = true) => {
    if (key !== 'device') setPage(1)
    setParams(
      (p) => {
        if (value) p.set(key, value)
        else p.delete(key)
        return p
      },
      { replace },
    )
  }
  // Devices that reported before and stopped (a device still waiting for its first reading is not "offline")
  const down = offline.data?.items.filter((d) => d.lastSeenAt) ?? []

  return (
    <div className="stack" style={{ gap: 24 }}>
      {down.length > 0 && (
        <div className="notice notice--warning">
          <Icon icon={Radio} />
          <span>
            <b>{t('adFarm.devices.offlineTitle', { count: down.length })}</b>{' '}
            {down.map((d) => t('adFarm.devices.offlineItem', { id: d.deviceId, what: what(d, t), pond: d.pond.name, since: formatDayTime(d.lastSeenAt!) })).join(' · ')}
          </span>
        </div>
      )}
      <section className="card">
        <div className="card-header">
          <div>
            <h2 className="card-title">{t('adFarm.tabs.devices')}</h2>
            {devices.data && <div className="card-sub">{t('adFarm.devices.sub', devices.data.counts)}</div>}
          </div>
          <button type="button" className="btn btn--primary btn--sm" disabled={!ponds.data?.items.length} onClick={() => setParam('device', 'new', false)}>
            <Icon icon={Plus} />
            {t('adFarm.devices.add')}
          </button>
        </div>
        <div className="card-body" style={{ paddingBottom: 16 }}>
          <div className="filter-bar">
            <select className="select" aria-label={t('adFarm.devices.col.pond')} value={pondId ?? ''} onChange={(e) => setParam('pond', e.target.value)}>
              <option value="">{t('adFarm.devices.pondAll')}</option>
              {ponds.data?.items.map((p) => (
                <option key={p.id} value={p.id}>
                  {t('adFarm.devices.pondIs', { name: p.name })}
                </option>
              ))}
            </select>
            <select className="select" aria-label={t('adFarm.devices.col.type')} value={type ?? ''} onChange={(e) => setParam('type', e.target.value)}>
              <option value="">{t('adFarm.devices.typeAll')}</option>
              {TYPES.map((v) => (
                <option key={v} value={v}>
                  {t('adFarm.devices.typeIs', { type: t(`deviceType.${v}`) })}
                </option>
              ))}
            </select>
            <select className="select" aria-label={t('adFarm.devices.col.connection')} value={connection ?? ''} onChange={(e) => setParam('connection', e.target.value)}>
              <option value="">{t('adFarm.devices.connectionAll')}</option>
              {CONNECTIONS.map((v) => (
                <option key={v} value={v}>
                  {t('adFarm.devices.connectionIs', { connection: t(`connection.${v}`) })}
                </option>
              ))}
            </select>
          </div>
        </div>
        <QueryState query={devices}>
          {(data) => {
            const pageCount = Math.max(1, Math.ceil(data.total / PAGE_SIZE))
            const from = data.total === 0 ? 0 : (data.page - 1) * PAGE_SIZE + 1
            const pondName = ponds.data?.items.find((p) => p.id === pondId)?.name
            return (
              <>
                <table className="table">
                  <thead>
                    <tr>
                      <th>{t('adFarm.devices.col.id')}</th>
                      <th>{t('adFarm.devices.col.type')}</th>
                      <th>{t('adFarm.devices.col.function')}</th>
                      <th>{t('adFarm.devices.col.pond')}</th>
                      <th>{t('adFarm.devices.col.connection')}</th>
                      <th>{t('adFarm.devices.col.lastSeen')}</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {data.items.length === 0 ? (
                      <tr>
                        <td colSpan={7}>
                          <div className="empty">
                            <span className="empty-title">{t(data.counts.total ? 'adFarm.devices.noneMatch' : 'adFarm.devices.none')}</span>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      data.items.map((d) => (
                        <tr key={d.deviceId}>
                          <td className="cell-main">{d.deviceId}</td>
                          <td>{t(d.type === 'sensor' ? 'adFarm.devices.sensor' : 'adFarm.devices.actuator')}</td>
                          <td>
                            <span className="row">
                              <Icon icon={d.parameter ? PARAM_ICON[d.parameter] : d.type === 'aerator' ? Fan : Droplets} className="text-muted" />
                              {what(d, t)}
                              {d.spec && ` · ${d.spec}`}
                            </span>
                          </td>
                          <td>{d.pond.name}</td>
                          <td>
                            <ConnectionText device={d} />
                          </td>
                          <td className={cx(!d.lastSeenAt && 'text-muted')}>{d.lastSeenAt ? formatRecentTime(d.lastSeenAt) : '—'}</td>
                          <td className="actions">
                            <button type="button" className="btn btn--link" aria-label={t('adFarm.devices.editDevice', { id: d.deviceId })} onClick={() => setParam('device', d.deviceId, false)}>
                              {t('adFarm.edit')}
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
                <div className="card-footer" style={{ justifyContent: 'space-between' }}>
                  <span className="caption">
                    {pondName && !type && !connection
                      ? t('adFarm.devices.showingPond', { count: data.total, pond: pondName })
                      : t('adUsers.showing', { from, to: Math.min(data.page * PAGE_SIZE, data.total), total: data.total })}
                  </span>
                  <Pagination page={data.page} pageCount={pageCount} onChange={setPage} />
                  <span className="caption">{t('adFarm.devices.note')}</span>
                </div>
                {editing && (editing === 'new' || data.items.some((d) => d.deviceId === editing)) && (
                  <DeviceDrawer
                    key={editing}
                    farmId={farm.id}
                    device={data.items.find((d) => d.deviceId === editing) ?? null}
                    ponds={ponds.data?.items ?? []}
                    defaultPondId={pondId}
                    onClose={() => setParam('device', null)}
                    onDone={(message) => (setParam('device', null), onDone(message))}
                  />
                )}
              </>
            )
          }}
        </QueryState>
      </section>
    </div>
  )
}

/** "Turbidity" for a sensor, "Aerator" / "Water pump" for an actuator. */
function what(d: Device, t: (key: string) => string) {
  return d.parameter ? t(`paramName.${d.parameter}`) : t(`deviceType.${d.type}`)
}

/** Online / Offline, or "Waiting for first reading" for a device that has never reported. */
function ConnectionText({ device: d }: { device: Device }) {
  const { t } = useTranslation()
  if (!d.lastSeenAt) return <span className="status-text st--neutral st--muted">{t('adFarm.devices.waiting')}</span>
  return <span className={cx('status-text', d.connection === 'online' ? 'st--normal' : 'st--offline')}>{t(`connection.${d.connection}`)}</span>
}

function DeviceDrawer({
  farmId,
  device,
  ponds,
  defaultPondId,
  onClose,
  onDone,
}: {
  farmId: string
  device: Device | null
  ponds: S['AdminPond'][]
  defaultPondId?: string
  onClose: () => void
  onDone: (message: string) => void
}) {
  const { t } = useTranslation()
  const save = useSaveDevice(farmId)
  const [deviceId, setDeviceId] = useState(device?.deviceId ?? '')
  const [type, setType] = useState<S['DeviceType']>(device?.type ?? 'sensor')
  const [parameter, setParameter] = useState<S['SensorParameter'] | ''>(device?.parameter ?? '')
  const [spec, setSpec] = useState(device?.spec ?? '')
  const [pondId, setPondId] = useState(device?.pond.id ?? defaultPondId ?? '')
  const [tried, setTried] = useState(false)

  const errors = {
    deviceId: !deviceId.trim() ? t('adFarm.devices.field.idRequired') : undefined,
    parameter: type === 'sensor' && !parameter ? t('adFarm.devices.field.measuresRequired') : undefined,
    pondId: !pondId ? t('adFarm.devices.field.pondRequired') : undefined,
  }
  const shown = (field: keyof typeof errors) => (tried ? errors[field] : undefined) ?? fieldError(save.error, field)
  const submit = () => {
    setTried(true)
    if (Object.values(errors).some(Boolean)) return
    save.mutate(
      {
        existing: !!device,
        body: { deviceId: deviceId.trim(), type, pondId, parameter: type === 'sensor' ? (parameter as S['SensorParameter']) : null, spec: type === 'sensor' ? null : spec.trim() || null },
      },
      { onSuccess: (d) => onDone(t(device ? 'adFarm.devices.saved' : 'adFarm.devices.added', { id: d.deviceId })) },
    )
  }
  const otherError = save.isError && !Object.keys(errors).some((f) => fieldError(save.error, f))

  return (
    <Drawer
      title={device ? device.deviceId : t('adFarm.devices.add')}
      caption={device ? t('adFarm.devices.editCaption') : undefined}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn--outline" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button type="button" className="btn btn--primary" disabled={save.isPending} onClick={submit}>
            {device ? t('adUsers.saveChanges') : t('adFarm.devices.add')}
          </button>
        </>
      }
    >
      <label className="field">
        <span className="field-label">
          <span>
            {t('adFarm.devices.col.id')} <span className="req">*</span>
          </span>
        </span>
        <input
          className={cx('input', shown('deviceId') && 'is-error')}
          value={deviceId}
          disabled={!!device}
          placeholder="A-P08-TRB2"
          onChange={(e) => setDeviceId(e.target.value)}
        />
        <span className={cx('helper', shown('deviceId') && 'is-error')}>{shown('deviceId') ?? t(device ? 'adFarm.devices.field.idFixed' : 'adFarm.devices.field.idHelp')}</span>
      </label>
      <label className="field">
        <span className="field-label">
          <span>
            {t('adFarm.devices.col.type')} <span className="req">*</span>
          </span>
        </span>
        <select className="select" value={type} onChange={(e) => setType(e.target.value as S['DeviceType'])}>
          {TYPES.map((v) => (
            <option key={v} value={v}>
              {t(`deviceType.${v}`)}
            </option>
          ))}
        </select>
      </label>
      {type === 'sensor' ? (
        <label className="field">
          <span className="field-label">
            <span>
              {t('adFarm.devices.field.measures')} <span className="req">*</span>
            </span>
          </span>
          <select className={cx('select', shown('parameter') && 'is-error')} value={parameter} onChange={(e) => setParameter(e.target.value as S['SensorParameter'])}>
            <option value="">{t('adFarm.devices.field.choose')}</option>
            {SENSOR_PARAMS.map((p) => (
              <option key={p} value={p}>
                {t(`paramName.${p}`)}
                {UNIT[p] && ` (${UNIT[p]})`}
              </option>
            ))}
          </select>
          {shown('parameter') && <span className="helper is-error">{shown('parameter')}</span>}
        </label>
      ) : (
        <label className="field">
          <span className="field-label">{t('adFarm.devices.field.spec')}</span>
          <input className="input" placeholder={type === 'aerator' ? 'Paddlewheel · 2 HP' : 'Inflow · 15 m³/h'} value={spec} onChange={(e) => setSpec(e.target.value)} />
        </label>
      )}
      <label className="field">
        <span className="field-label">
          <span>
            {t('adFarm.devices.col.pond')} <span className="req">*</span>
          </span>
        </span>
        <select className={cx('select', shown('pondId') && 'is-error')} value={pondId} onChange={(e) => setPondId(e.target.value)}>
          <option value="">{t('adFarm.devices.field.choose')}</option>
          {ponds.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
              {p.status === 'fallow' ? ` (${t('adFarm.pondStatus.fallow')})` : ''}
            </option>
          ))}
        </select>
        {shown('pondId') && <span className="helper is-error">{shown('pondId')}</span>}
      </label>
      {!device && (
        <div className="notice">
          <Icon icon={Info} />
          <span>{t('adFarm.devices.firstReading')}</span>
        </div>
      )}
      {otherError && <span className="helper is-error">{isApiError(save.error) ? save.error.problem?.title : t('adUsers.failed')}</span>}
    </Drawer>
  )
}
