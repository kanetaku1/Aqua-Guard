import { format } from 'date-fns'
import { TZDate } from '@date-fns/tz'
import { ArrowRight, Info } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import type { components } from '@/api/schema'
import type { Severity } from '@/api/types'
import { Check } from '@/components/Check'
import { Drawer } from '@/components/Drawer'
import { Icon } from '@/components/Icon'
import { cx } from '@/lib/cx'
import { WIB, formatCalendarDate, formatNumber, wibDateTimeToIso } from '@/lib/format'
import { newKey, type ManualAction, type ManualEvent, type PondInput } from './draft'

type S = components['schemas']
const APPETITES: S['Appetite'][] = ['good', 'reduced', 'poor']
const TRAYS: S['TrayCondition'][] = ['clean', 'leftover', 'much_leftover']
const HEALTH: Severity[] = ['normal', 'attention', 'warning', 'critical']
const OBSERVATIONS: S['HealthObservation'][] = ['reduced_appetite', 'abnormal_swimming', 'gill_discoloration', 'shell_condition', 'other']
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/
const wibTime = (iso: string) => format(new TZDate(new Date(iso).getTime(), WIB), 'HH:mm')

/** Pond editor (`?pond=`): records are read-only here; the TM records appetite, tray and health observations. */
export function PondDrawer({
  date,
  row,
  value,
  readOnly,
  onSave,
  onClose,
}: {
  date: string
  row: S['DailyPondRow']
  value: PondInput
  readOnly: boolean
  onSave: (v: PondInput) => void
  onClose: () => void
}) {
  const { t } = useTranslation()
  const [v, setV] = useState(value)
  const set = (patch: Partial<PondInput>) => setV((x) => ({ ...x, ...patch }))
  const toggle = (o: S['HealthObservation']) =>
    set({ observations: v.observations.includes(o) ? v.observations.filter((x) => x !== o) : OBSERVATIONS.filter((x) => x === o || v.observations.includes(x)) })

  return (
    <Drawer
      caption={t('daily.drawerCaption', { date: formatCalendarDate(date) })}
      title={row.pond.name}
      onClose={onClose}
      footer={
        readOnly ? (
          <button type="button" className="btn btn--outline" onClick={onClose}>
            {t('common.close')}
          </button>
        ) : (
          <>
            <button type="button" className="btn btn--outline" onClick={onClose}>
              {t('common.cancel')}
            </button>
            <button type="button" className="btn btn--primary" onClick={() => onSave(v)}>
              {t('daily.pond.save', { pond: row.pond.name })}
            </button>
          </>
        )
      }
    >
      <div className="form-grid">
        <div className="field">
          <span className="field-label">
            {t('daily.pond.feedSoFar')} <span className="source-tag">{t('daily.records')}</span>
          </span>
          <div className="input is-readonly">{t('daily.pond.feedValue', { kg: formatNumber(row.feedKg), done: row.feedRounds, planned: row.feedRoundsPlanned })}</div>
        </div>
        <div className="field">
          <span className="field-label">
            {t('daily.pond.mortality')} <span className="source-tag">{t('daily.records')}</span>
          </span>
          <div className="input is-readonly">{t('daily.pond.mortalityValue', { pcs: formatNumber(row.mortalityPcs), kg: formatNumber(row.mortalityKg, 2) })}</div>
        </div>
        <label className="field">
          <span className="field-label">{t('daily.appetite')}</span>
          <select className="select" disabled={readOnly} value={v.appetite} onChange={(e) => set({ appetite: e.target.value as S['Appetite'] })}>
            {APPETITES.map((a) => (
              <option key={a} value={a}>
                {t(`appetite.${a}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field-label">{t('daily.pond.tray')}</span>
          <select className="select" disabled={readOnly} value={v.tray} onChange={(e) => set({ tray: e.target.value as S['TrayCondition'] })}>
            {TRAYS.map((a) => (
              <option key={a} value={a}>
                {t(`tray.${a}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="field span-2">
          <span className="field-label">{t('daily.pond.mortalityNote')}</span>
          <input
            className="input"
            disabled={readOnly}
            placeholder={t('daily.pond.mortalityNotePlaceholder')}
            value={v.mortalityNote ?? ''}
            onChange={(e) => set({ mortalityNote: e.target.value || null })}
          />
        </label>
      </div>
      <Link className="btn btn--link" to={`/tm/ponds/${row.pond.id}?tab=feeding`} style={{ alignSelf: 'flex-start' }}>
        {t('daily.pond.correctRecords', { pond: row.pond.name })}
        <Icon icon={ArrowRight} />
      </Link>
      <hr className="divider" />
      <label className="field">
        <span className="field-label">{t('daily.healthCondition')}</span>
        <select className="select" disabled={readOnly} value={v.health} onChange={(e) => set({ health: e.target.value as Severity })}>
          {HEALTH.map((h) => (
            <option key={h} value={h}>
              {t(`severity.${h}`)}
            </option>
          ))}
        </select>
      </label>
      <div className="field">
        <span className="field-label">{t('daily.observations')}</span>
        <div className="stack" style={{ gap: 8 }}>
          {OBSERVATIONS.map((o) => (
            <label key={o} className="row">
              <Check checked={v.observations.includes(o)} disabled={readOnly} onChange={() => toggle(o)} />
              {t(`healthObservation.${o}`)}
            </label>
          ))}
        </div>
      </div>
      <label className="field">
        <span className="field-label">{t('records.note')}</span>
        <textarea className="textarea" disabled={readOnly} value={v.healthNote ?? ''} onChange={(e) => set({ healthNote: e.target.value || null })} />
      </label>
      <div className="notice">
        <Icon icon={Info} />
        <span>
          {t('daily.pond.waterNotice')} <Link to={`/tm/ponds/${row.pond.id}?tab=iot`}>{t('daily.pond.viewWater', { pond: row.pond.name })}</Link>
        </span>
      </div>
    </Drawer>
  )
}

type PondOption = { id: string; name: string }

/** Add / edit a manual action (Actions Taken). */
export function ActionDrawer({
  date,
  ponds,
  value,
  onSave,
  onRemove,
  onClose,
}: {
  date: string
  ponds: PondOption[]
  value: ManualAction | null
  onSave: (a: ManualAction) => void
  onRemove: () => void
  onClose: () => void
}) {
  const { t } = useTranslation()
  const [time, setTime] = useState(value ? wibTime(value.at) : '')
  const [pondId, setPondId] = useState(value?.pondId ?? '')
  const [action, setAction] = useState(value?.action ?? '')
  const [outcome, setOutcome] = useState(value?.outcome ?? '')
  const [tried, setTried] = useState(false)
  const ok = TIME.test(time) && action.trim() !== ''

  const save = () => {
    setTried(true)
    if (!ok) return
    onSave({ id: value?.id, key: value?.key ?? newKey(), at: wibDateTimeToIso(date, time), pondId: pondId || null, action: action.trim(), outcome: outcome.trim() || null })
  }

  return (
    <Drawer
      caption={t('daily.drawerCaption', { date: formatCalendarDate(date) })}
      title={value ? t('daily.actions.edit') : t('daily.actions.add')}
      onClose={onClose}
      footer={
        <>
          {value && (
            <button type="button" className="btn btn--outline" onClick={onRemove}>
              {t('daily.remove')}
            </button>
          )}
          <button type="button" className="btn btn--outline" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button type="button" className="btn btn--primary" onClick={save}>
            {t('daily.apply')}
          </button>
        </>
      }
    >
      <div className="form-grid">
        <label className="field">
          <span className="field-label">
            <span>
              {t('daily.time')} <span className="req">*</span>
            </span>
          </span>
          <input className={cx('input', tried && !TIME.test(time) && 'is-error')} placeholder="HH:mm" value={time} onChange={(e) => setTime(e.target.value)} />
        </label>
        <label className="field">
          <span className="field-label">{t('daily.pondField')}</span>
          <select className="select" value={pondId} onChange={(e) => setPondId(e.target.value)}>
            <option value="">{t('daily.farmWide')}</option>
            {ponds.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field span-2">
          <span className="field-label">
            <span>
              {t('daily.actions.action')} <span className="req">*</span>
            </span>
          </span>
          <input className={cx('input', tried && !action.trim() && 'is-error')} value={action} onChange={(e) => setAction(e.target.value)} />
        </label>
        <label className="field span-2">
          <span className="field-label">{t('daily.actions.outcome')}</span>
          <input className="input" value={outcome} onChange={(e) => setOutcome(e.target.value)} />
        </label>
      </div>
      {tried && !ok && <span className="helper is-error">{t('daily.actions.error')}</span>}
    </Drawer>
  )
}

/** Add / edit a manual equipment event (Equipment Status). */
export function EquipmentDrawer({
  date,
  ponds,
  value,
  onSave,
  onRemove,
  onClose,
}: {
  date: string
  ponds: PondOption[]
  value: ManualEvent | null
  onSave: (e: ManualEvent) => void
  onRemove: () => void
  onClose: () => void
}) {
  const { t } = useTranslation()
  const [equipment, setEquipment] = useState(value?.equipment ?? '')
  const [pondId, setPondId] = useState(value?.pondId ?? '')
  const [failure, setFailure] = useState(value?.failure ?? '')
  const [time, setTime] = useState(value ? wibTime(value.occurredAt) : '')
  const [action, setAction] = useState(value?.action ?? '')
  const [status, setStatus] = useState<ManualEvent['status']>(value?.status ?? 'in_progress')
  const [tried, setTried] = useState(false)
  const ok = equipment.trim() !== '' && failure.trim() !== '' && TIME.test(time)

  const save = () => {
    setTried(true)
    if (!ok) return
    onSave({
      id: value?.id,
      key: value?.key ?? newKey(),
      equipment: equipment.trim(),
      pondId: pondId || null,
      failure: failure.trim(),
      occurredAt: wibDateTimeToIso(date, time),
      action: action.trim() || null,
      status,
    })
  }

  return (
    <Drawer
      caption={t('daily.drawerCaption', { date: formatCalendarDate(date) })}
      title={value ? t('daily.equipment.edit') : t('daily.equipment.add')}
      onClose={onClose}
      footer={
        <>
          {value && (
            <button type="button" className="btn btn--outline" onClick={onRemove}>
              {t('daily.remove')}
            </button>
          )}
          <button type="button" className="btn btn--outline" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button type="button" className="btn btn--primary" onClick={save}>
            {t('daily.apply')}
          </button>
        </>
      }
    >
      <div className="form-grid">
        <label className="field">
          <span className="field-label">
            <span>
              {t('daily.equipment.equipment')} <span className="req">*</span>
            </span>
          </span>
          <input className={cx('input', tried && !equipment.trim() && 'is-error')} placeholder={t('daily.equipment.equipmentPlaceholder')} value={equipment} onChange={(e) => setEquipment(e.target.value)} />
        </label>
        <label className="field">
          <span className="field-label">{t('daily.pondField')}</span>
          <select className="select" value={pondId} onChange={(e) => setPondId(e.target.value)}>
            <option value="">{t('daily.farmWide')}</option>
            {ponds.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field-label">
            <span>
              {t('daily.equipment.failure')} <span className="req">*</span>
            </span>
          </span>
          <input className={cx('input', tried && !failure.trim() && 'is-error')} value={failure} onChange={(e) => setFailure(e.target.value)} />
        </label>
        <label className="field">
          <span className="field-label">
            <span>
              {t('daily.equipment.occurred')} <span className="req">*</span>
            </span>
          </span>
          <input className={cx('input', tried && !TIME.test(time) && 'is-error')} placeholder="HH:mm" value={time} onChange={(e) => setTime(e.target.value)} />
        </label>
        <label className="field span-2">
          <span className="field-label">{t('daily.equipment.action')}</span>
          <input className="input" value={action} onChange={(e) => setAction(e.target.value)} />
        </label>
        <label className="field">
          <span className="field-label">{t('daily.equipment.status')}</span>
          <select className="select" value={status} onChange={(e) => setStatus(e.target.value as ManualEvent['status'])}>
            <option value="in_progress">{t('daily.equipment.in_progress')}</option>
            <option value="resolved">{t('daily.equipment.resolved')}</option>
          </select>
        </label>
      </div>
      {tried && !ok && <span className="helper is-error">{t('daily.equipment.error')}</span>}
    </Drawer>
  )
}
