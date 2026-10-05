import { Info, Lock, TriangleAlert, UserX } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { isApiError } from '@/api/client'
import { useLogin } from '@/api/queries/auth'
import { safeNext } from '@/auth/roles'
import { Icon } from '@/components/Icon'
import { Logo } from '@/components/Logo'
import { useDocumentTitle } from '@/components/useDocumentTitle'
import { PasswordInput } from '@/components/PasswordInput'
import { AuthLayout } from '@/layout/AuthLayout'

/** AU-01 Login: email + password, errors without saying which one is wrong, lock after 5 failures. */
export function Login() {
  useDocumentTitle('AU-01 Login')
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const login = useLogin()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const error = login.error
  const code = isApiError(error) ? error.code : undefined
  const locked = code === 'account_locked'
  const invalid = code === 'invalid_credentials'

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    login.mutate(
      { email, password },
      { onSuccess: (me) => navigate(safeNext(params.get('next'), me.role), { replace: true }) },
    )
  }

  return (
    <AuthLayout footer={t('auth.footerWib')}>
      <div className="auth-brand">
        <span className="auth-logo">
          <Logo />
        </span>
        <h1 className="auth-title">{t('app.name')}</h1>
        <span className="auth-sub">Nusantara Shrimp Co.</span>
      </div>

      {invalid && (
        <div className="notice notice--warning" role="alert">
          <Icon icon={TriangleAlert} />
          <span>
            {t('auth.invalid')}{' '}
            {isApiError(error) && error.problem?.remainingAttempts !== undefined && (
              <Trans i18nKey="auth.attemptsLeft" count={error.problem.remainingAttempts} components={{ b: <b /> }} />
            )}
          </span>
        </div>
      )}
      {locked && (
        <div className="notice notice--warning" role="alert">
          <Icon icon={Lock} />
          <span>
            <Trans i18nKey="auth.locked" components={{ a: <Link to="/forgot-password" /> }} />
          </span>
        </div>
      )}
      {code === 'account_deactivated' && (
        <div className="notice notice--warning" role="alert">
          <Icon icon={UserX} />
          <span>{t('auth.deactivated')}</span>
        </div>
      )}
      {error && !code && (
        <div className="notice notice--warning" role="alert">
          <Icon icon={TriangleAlert} />
          <span>{t('auth.unexpected')}</span>
        </div>
      )}
      {!error && params.has('expired') && (
        <div className="notice">
          <Icon icon={Info} />
          <span>{t('auth.expired')}</span>
        </div>
      )}
      {!error && params.has('reset') && (
        <div className="notice">
          <Icon icon={Info} />
          <span>{t('auth.passwordChanged')}</span>
        </div>
      )}

      <form className="stack" onSubmit={onSubmit}>
        <label className="field">
          <span className="field-label">
            <span>
              {t('auth.email')} <span className="req">*</span>
            </span>
          </span>
          <input className="input" type="email" required autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="field">
          <span className="field-label">
            <span>
              {t('auth.password')} <span className="req">*</span>
            </span>
          </span>
          <PasswordInput required autoComplete="current-password" invalid={invalid} value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        <div className="row-between">
          <span />
          <Link className="btn btn--link" to="/forgot-password">
            {t('auth.forgot')}
          </Link>
        </div>
        <button className="btn btn--primary btn--lg btn--block" disabled={locked || login.isPending}>
          {t('auth.signIn')}
        </button>
      </form>
    </AuthLayout>
  )
}
