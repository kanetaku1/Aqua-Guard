import { Building2, ChevronDown, Globe } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useUpdateLanguage } from '@/api/queries/auth'
import { useSyncStatus } from '@/api/queries/common'
import type { Language, Me } from '@/api/types'
import { Icon } from '@/components/Icon'
import { Logo } from '@/components/Logo'
import { changeLanguage } from '@/i18n'
import { cx } from '@/lib/cx'
import { formatDateTime } from '@/lib/format'

/** Brand · scope · data freshness · language · user (07 Global Header). SA has no data freshness. */
export function GlobalHeader({ me }: { me: Me }) {
  const { t, i18n } = useTranslation()
  const showSync = me.role !== 'system_administrator'
  const sync = useSyncStatus(showSync)
  const updateLanguage = useUpdateLanguage()
  const language = (i18n.resolvedLanguage ?? 'en') as Language

  const toggleLanguage = () => {
    const next: Language = language === 'en' ? 'id' : 'en'
    void changeLanguage(next)
    updateLanguage.mutate(next)
  }

  return (
    <header className="gh">
      <div className="gh-brand">
        <span className="gh-logo">
          <Logo />
        </span>
        {t('app.name')}
      </div>
      <div className="gh-scope">
        <Icon icon={Building2} />
        <span>{me.company}</span>
        <span className="sep">/</span>
        <span className="strong">{me.scopeLabel}</span>
      </div>
      <div className="gh-spacer" />
      {showSync && sync.data && (
        <div className="gh-sync">
          <span className={cx('gh-live', sync.data.quality !== 'live' && 'is-delayed')}>{t(`quality.${sync.data.quality}`)}</span>
          {sync.data.syncedAt && <span>{t('header.synced', { time: formatDateTime(sync.data.syncedAt) })}</span>}
        </div>
      )}
      <span
        className="gh-lang"
        role="button"
        tabIndex={0}
        aria-label={t('header.language')}
        onClick={toggleLanguage}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && toggleLanguage()}
      >
        <Icon icon={Globe} />
        {language.toUpperCase()}
        <Icon icon={ChevronDown} />
      </span>
      <div className="gh-user">
        <span className="gh-avatar">{me.initials}</span>
        <div>
          <div className="gh-user-name">{me.name}</div>
          <div className="gh-user-role">{t(`role.${me.role}`)}</div>
        </div>
        <Icon icon={ChevronDown} className="text-muted" />
      </div>
    </header>
  )
}
