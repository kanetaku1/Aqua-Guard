import { ArrowLeft, KeyRound, Mail } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { useRequestPasswordReset } from '@/api/queries/auth'
import { Icon } from '@/components/Icon'
import { useDocumentTitle } from '@/components/useDocumentTitle'
import { AuthLayout } from '@/layout/AuthLayout'

/** AU-02: the same message is shown whether or not the account exists. */
export function ForgotPassword() {
  useDocumentTitle('AU-02 Forgot Password')
  const { t } = useTranslation()
  const request = useRequestPasswordReset()
  const [email, setEmail] = useState('')

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    request.mutate(email)
  }

  return (
    <AuthLayout>
      <div className="auth-brand">
        <span className="auth-logo">
          <KeyRound strokeWidth={1.75} aria-hidden="true" />
        </span>
        <h1 className="auth-title">{t('auth.resetTitle')}</h1>
        <span className="auth-sub">{t('auth.resetSub')}</span>
      </div>

      {request.isSuccess ? (
        <div className="stack">
          <div className="notice" role="status">
            <Icon icon={Mail} />
            <span>
              <Trans i18nKey="auth.sent" values={{ email }} components={{ b: <b /> }} />
            </span>
          </div>
          <span className="helper">{t('auth.sentHelp')}</span>
        </div>
      ) : (
        <form className="stack" onSubmit={onSubmit}>
          <label className="field">
            <span className="field-label">
              <span>
                {t('auth.email')} <span className="req">*</span>
              </span>
            </span>
            <input
              className="input"
              type="email"
              required
              placeholder="name@nusantarashrimp.co.id"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          {request.isError && <span className="helper is-error">{t('auth.unexpected')}</span>}
          <button className="btn btn--primary btn--lg btn--block" disabled={request.isPending}>
            {t('auth.sendLink')}
          </button>
        </form>
      )}

      <Link className="btn btn--link" to="/login" style={{ alignSelf: 'center' }}>
        <Icon icon={ArrowLeft} />
        {t('auth.backToSignIn')}
      </Link>
    </AuthLayout>
  )
}
