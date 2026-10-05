import { Construction } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { PageHeader } from '@/components/Page'
import { useDocumentTitle } from '@/components/useDocumentTitle'
import type { ScreenDef } from './screens'

/** Screens that are routed but not built yet: show the screen ID and the prototype to follow. */
export function Placeholder({ screen }: { screen: ScreenDef }) {
  const { t } = useTranslation()
  useDocumentTitle(`${screen.id} ${screen.title}`)
  return (
    <>
      <PageHeader title={screen.title} meta={<span>{screen.id}</span>} />
      <section className="card">
        <div className="empty">
          <Construction strokeWidth={1.75} aria-hidden="true" />
          <span className="empty-title">{t('placeholder.notBuilt')}</span>
          <span>
            {t('placeholder.seePrototype')} <code>frontend/prototype/screens/{screen.prototype}</code>
          </span>
        </div>
      </section>
    </>
  )
}
