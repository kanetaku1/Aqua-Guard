import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { Language } from '@/api/types'
import { changeLanguage } from '@/i18n'

/** Auth screens (AU-01〜03): no app shell, language switch, centered card, footer. */
export function AuthLayout({ children, footer }: { children: ReactNode; footer?: string }) {
  const { t, i18n } = useTranslation()
  return (
    <div className="auth-page">
      <div className="auth-top">
        <select
          className="select"
          aria-label={t('auth.language')}
          value={i18n.resolvedLanguage ?? 'en'}
          onChange={(e) => void changeLanguage(e.target.value as Language)}
        >
          <option value="en">English</option>
          <option value="id">Bahasa Indonesia</option>
        </select>
      </div>
      <main className="auth-main">
        <section className="auth-card">{children}</section>
      </main>
      <footer className="auth-foot">{footer ?? t('auth.footer')}</footer>
    </div>
  )
}
