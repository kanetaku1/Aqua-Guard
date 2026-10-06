import { CloudOff } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { AuthLayout } from '@/layout/AuthLayout'

/**
 * The session check (`/auth/me`) failed for a reason other than "not signed in": the server cannot be reached.
 * Shown instead of the app shell, in the sign-in page layout; in development it also says how to run without a backend.
 */
export function ServerUnavailable({ onRetry, retrying }: { onRetry: () => void; retrying: boolean }) {
  const { t } = useTranslation()
  return (
    <AuthLayout>
      <div className="auth-brand" role="alert">
        <CloudOff strokeWidth={1.75} aria-hidden="true" />
        <h1 className="auth-title">{t('app.serverDown.title')}</h1>
        <p className="auth-sub">{t('app.serverDown.body')}</p>
        {import.meta.env.DEV && <p className="caption">{t('app.serverDown.devHint')}</p>}
      </div>
      <button type="button" className="btn btn--primary btn--block" disabled={retrying} onClick={onRetry}>
        {t('common.retry')}
      </button>
    </AuthLayout>
  )
}
