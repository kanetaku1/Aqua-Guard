import { Info } from 'lucide-react'
import { useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { isApiError } from '@/api/client'
import { useCreateFarm } from '@/api/queries/admin'
import type { components } from '@/api/schema'
import { Drawer } from '@/components/Drawer'
import { Icon } from '@/components/Icon'
import { cx } from '@/lib/cx'
import { fieldError } from './fieldError'

type TimeZone = components['schemas']['AdminFarm']['timeZone']
const TIME_ZONES: TimeZone[] = ['Asia/Jakarta', 'Asia/Makassar', 'Asia/Jayapura']

/** Add farm drawer (AD-F-002). The Farm starts Inactive; after adding, its detail (AD-03) opens to set it up. */
export function AddFarmDrawer({ onClose, onAdded }: { onClose: () => void; onAdded: (farmId: string) => void }) {
  const { t } = useTranslation()
  const create = useCreateFarm()
  const [name, setName] = useState('')
  const [location, setLocation] = useState('')
  const [timeZone, setTimeZone] = useState<TimeZone>('Asia/Jakarta')
  const [tried, setTried] = useState(false)

  const errors = {
    name: !name.trim() ? t('adFarms.field.nameRequired') : undefined,
    location: !location.trim() ? t('adFarms.field.locationRequired') : undefined,
  }
  const shown = (field: keyof typeof errors) => (tried ? errors[field] : undefined) ?? fieldError(create.error, field)
  const submit = () => {
    setTried(true)
    if (errors.name || errors.location) return
    create.mutate({ name: name.trim(), location: location.trim(), timeZone }, { onSuccess: (farm) => onAdded(farm.id) })
  }
  const otherError = create.isError && !fieldError(create.error, 'name') && !fieldError(create.error, 'location')

  return (
    <Drawer
      title={t('adFarms.add')}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn--outline" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button type="button" className="btn btn--primary" disabled={create.isPending} onClick={submit}>
            {t('adFarms.add')}
          </button>
        </>
      }
    >
      <label className="field">
        <span className="field-label">
          <span>
            {t('adFarms.field.name')} <span className="req">*</span>
          </span>
        </span>
        <input className={cx('input', shown('name') && 'is-error')} placeholder={t('adFarms.field.namePlaceholder')} value={name} onChange={(e) => setName(e.target.value)} />
        {shown('name') && <span className="helper is-error">{shown('name')}</span>}
      </label>
      <label className="field">
        <span className="field-label">
          <span>
            {t('adFarms.field.location')} <span className="req">*</span>
          </span>
        </span>
        <input className={cx('input', shown('location') && 'is-error')} placeholder={t('adFarms.field.locationPlaceholder')} value={location} onChange={(e) => setLocation(e.target.value)} />
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
      <div className="notice">
        <Icon icon={Info} />
        <span>
          <Trans i18nKey="adFarms.startsInactive" components={{ b: <b /> }} />
        </span>
      </div>
      {otherError && <span className="helper is-error">{isApiError(create.error) ? create.error.problem?.title : t('adUsers.failed')}</span>}
    </Drawer>
  )
}
