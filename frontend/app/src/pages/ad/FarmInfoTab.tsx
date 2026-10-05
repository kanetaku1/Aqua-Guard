import { ArrowRight, TriangleAlert } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { isApiError } from '@/api/client'
import { useUpdateFarm } from '@/api/queries/admin'
import type { components } from '@/api/schema'
import { ConfirmDialog } from '@/components/Controls'
import { Icon } from '@/components/Icon'
import { Toggle } from '@/components/Toggle'
import { cx } from '@/lib/cx'
import { fieldError } from './fieldError'

type S = components['schemas']
type TimeZone = S['AdminFarm']['timeZone']
const TIME_ZONES: TimeZone[] = ['Asia/Jakarta', 'Asia/Makassar', 'Asia/Jayapura']

/** Farm Info (AD-F-003): name, location, time zone and Active / Inactive; the assigned users are read-only here. */
export function FarmInfoTab({ farm, onDone }: { farm: S['AdminFarm']; onDone: (message: string) => void }) {
  const { t } = useTranslation()
  const update = useUpdateFarm(farm.id)
  const [name, setName] = useState(farm.name)
  const [location, setLocation] = useState(farm.location)
  const [timeZone, setTimeZone] = useState<TimeZone>(farm.timeZone)
  const [active, setActive] = useState(farm.status === 'active')
  const [tried, setTried] = useState(false)
  const [confirming, setConfirming] = useState(false)

  const dirty = name !== farm.name || location !== farm.location || timeZone !== farm.timeZone || active !== (farm.status === 'active')
  const errors = { name: !name.trim() ? t('adFarms.field.nameRequired') : undefined, location: !location.trim() ? t('adFarms.field.locationRequired') : undefined }
  const shown = (field: keyof typeof errors) => (tried ? errors[field] : undefined) ?? fieldError(update.error, field)
  const reset = () => {
    setName(farm.name)
    setLocation(farm.location)
    setTimeZone(farm.timeZone)
    setActive(farm.status === 'active')
    setTried(false)
    update.reset()
  }
  const send = () =>
    update.mutate(
      { name: name.trim(), location: location.trim(), timeZone, status: active ? 'active' : 'inactive' },
      { onSuccess: (f) => (setConfirming(false), onDone(t('adFarm.saved', { name: f.name }))), onError: () => setConfirming(false) },
    )
  const save = () => {
    setTried(true)
    if (errors.name || errors.location) return
    // Hiding a working Farm from the FM and TM screens is confirmed first
    if (farm.status === 'active' && !active) setConfirming(true)
    else send()
  }

  // Activating before the set-up is complete: say what is missing (not blocked — 05 AD-02)
  const activating = active && farm.status === 'inactive'
  const missing = [
    farm.pondsInOperation === 0 && t('adFarm.setup.ponds'),
    farm.devicesTotal === 0 && t('adFarm.setup.devices'),
    !farm.technicalManagers.some((m) => m.status === 'active') && t('adFarm.setup.tm'),
  ].filter(Boolean)

  return (
    <div className="grid cols-8-4">
      <section className="card">
        <div className="card-header">
          <h2 className="card-title">{t('adFarm.info.title')}</h2>
        </div>
        <div className="card-body form-grid">
          <label className="field">
            <span className="field-label">
              <span>
                {t('adFarms.field.name')} <span className="req">*</span>
              </span>
            </span>
            <input className={cx('input', shown('name') && 'is-error')} value={name} onChange={(e) => setName(e.target.value)} />
            {shown('name') && <span className="helper is-error">{shown('name')}</span>}
          </label>
          <label className="field">
            <span className="field-label">
              <span>
                {t('adFarms.field.location')} <span className="req">*</span>
              </span>
            </span>
            <input className={cx('input', shown('location') && 'is-error')} value={location} onChange={(e) => setLocation(e.target.value)} />
            {shown('location') && <span className="helper is-error">{shown('location')}</span>}
          </label>
          <label className="field">
            <span className="field-label">{t('adFarms.field.timeZone')}</span>
            <select className="select" value={timeZone} onChange={(e) => setTimeZone(e.target.value as TimeZone)}>
              {TIME_ZONES.map((z) => (
                <option key={z} value={z}>
                  {t(`timeZone.${z.replace('Asia/', '')}`)}
                </option>
              ))}
            </select>
          </label>
          <div className="field">
            <span className="field-label">{t('adFarm.info.status')}</span>
            <span className="row" style={{ minHeight: 40 }}>
              <Toggle on={active} onChange={setActive} label={t('adFarm.info.status')} />
              {t(active ? 'adFarm.info.activeHelp' : 'adFarm.info.inactiveHelp')}
            </span>
          </div>
          {activating && missing.length > 0 && (
            <div className="notice notice--warning span-2">
              <Icon icon={TriangleAlert} />
              <span>{t('adFarm.setup.notice', { items: missing.join(' · ') })}</span>
            </div>
          )}
          {update.isError && !fieldError(update.error, 'name') && !fieldError(update.error, 'location') && (
            <span className="helper is-error span-2">{isApiError(update.error) ? update.error.problem?.title : t('adUsers.failed')}</span>
          )}
        </div>
        <div className="card-footer">
          <button type="button" className="btn btn--outline" disabled={!dirty} onClick={reset}>
            {t('common.cancel')}
          </button>
          <button type="button" className="btn btn--primary" disabled={!dirty || update.isPending} onClick={save}>
            {t('adUsers.saveChanges')}
          </button>
        </div>
      </section>

      <section className="card">
        <div className="card-header">
          <h2 className="card-title">{t('adFarm.users.title')}</h2>
          <Link className="btn btn--link" to={`/ad/users?farm=${farm.id}`}>
            {t('adFarm.users.link')}
            <Icon icon={ArrowRight} />
          </Link>
        </div>
        {farm.technicalManagers.length === 0 ? (
          <div className="card-body">
            <span className="caption">{t('adFarm.users.none')}</span>
          </div>
        ) : (
          <table className="table table-compact">
            <tbody>
              {farm.technicalManagers.map((m) => (
                <tr key={m.id}>
                  <td>
                    <div className="cell-main">{m.name}</div>
                    <div className="cell-sub">{t('role.technical_manager')}</div>
                  </td>
                  <td className="actions">
                    <span className={cx('status-text', m.status === 'active' ? 'st--normal' : 'st--progress')}>{t(`userStatus.${m.status}`)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="card-footer" style={{ justifyContent: 'flex-start' }}>
          <span className="caption">{t('adFarm.users.note')}</span>
        </div>
      </section>

      {confirming && (
        <ConfirmDialog
          danger
          title={t('adFarm.deactivate.title', { name: farm.name })}
          confirmLabel={t('adFarm.deactivate.confirm')}
          busy={update.isPending}
          onCancel={() => setConfirming(false)}
          onConfirm={send}
        >
          <p className="text-muted">{t('adFarm.deactivate.body', { name: farm.name })}</p>
        </ConfirmDialog>
      )}
    </div>
  )
}
