import { useTranslation } from 'react-i18next'
import { useAdminFarms } from '@/api/queries/admin'
import type { components } from '@/api/schema'
import { cx } from '@/lib/cx'

type S = components['schemas']
const LANGUAGES: S['Language'][] = ['id', 'en']

/** Assigned Farm* — a Technical Manager works in exactly one Farm ("Farm A · East Java"). */
export function FarmField({ value, onChange, error, disabled }: { value: string; onChange: (farmId: string) => void; error?: string; disabled?: boolean }) {
  const { t } = useTranslation()
  const farms = useAdminFarms()
  return (
    <label className="field">
      <span className="field-label">
        <span>
          {t('adUsers.field.farm')} <span className="req">*</span>
        </span>
      </span>
      <select className={cx('select', error && 'is-error')} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
        <option value="">{t('adUsers.field.farmChoose')}</option>
        {/* Inactive Farms are listed too: a TM is assigned while the Farm is being set up, before it is activated (AD-03) */}
        {farms.data?.items.map((f) => (
          <option key={f.id} value={f.id}>
            {f.name} · {f.location.split(',')[0]}
            {f.status === 'inactive' ? ` (${t('adFarms.status.inactive')})` : ''}
          </option>
        ))}
      </select>
      <span className={cx('helper', error && 'is-error')}>{error ?? t('adUsers.field.farmHelp')}</span>
    </label>
  )
}

export function LanguageField({ value, onChange }: { value: S['Language']; onChange: (language: S['Language']) => void }) {
  const { t } = useTranslation()
  return (
    <label className="field">
      <span className="field-label">{t('adUsers.field.language')}</span>
      <select className="select" value={value} onChange={(e) => onChange(e.target.value as S['Language'])}>
        {LANGUAGES.map((l) => (
          <option key={l} value={l}>
            {t(`language.${l}`)}
          </option>
        ))}
      </select>
    </label>
  )
}
