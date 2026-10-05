import { Clock, KeyRound } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router'
import { isApiError } from '@/api/client'
import { usePasswordToken, useSetPassword } from '@/api/queries/auth'
import { HOME_PATH } from '@/auth/roles'
import { Icon } from '@/components/Icon'
import { Logo } from '@/components/Logo'
import { useDocumentTitle } from '@/components/useDocumentTitle'
import { PasswordInput } from '@/components/PasswordInput'
import { QueryState } from '@/components/QueryState'
import { AuthLayout } from '@/layout/AuthLayout'
import { cx } from '@/lib/cx'

/** Password rules (02 §7): at least 10 characters with a letter and a number. */
function passwordRules(password: string) {
  return {
    letterNumber: /[a-z]/i.test(password) && /\d/.test(password),
    length: password.length >= 10,
  }
}

/** AU-03: set a password from an invitation (then signed in) or a reset link (then back to Login). */
export function SetPassword() {
  useDocumentTitle('AU-03 Set Password')
  const [params] = useSearchParams()
  const token = params.get('token')
  const tokenQuery = usePasswordToken(token)

  if (!token) return <Navigate to="/forgot-password" replace />
  if (isApiError(tokenQuery.error, 410)) return <ExpiredLink />
  return (
    <AuthLayout>
      <QueryState query={tokenQuery}>{(info) => <SetPasswordForm token={token} info={info} />}</QueryState>
    </AuthLayout>
  )
}

function SetPasswordForm({ token, info }: { token: string; info: NonNullable<ReturnType<typeof usePasswordToken>['data']> }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const setPassword = useSetPassword()
  const [password, setPasswordValue] = useState('')
  const [confirm, setConfirm] = useState('')
  const rules = passwordRules(password)
  const matches = password.length > 0 && password === confirm
  const ready = rules.letterNumber && rules.length && matches
  const invite = info.mode === 'invite'

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    setPassword.mutate(
      { token, password },
      {
        onSuccess: (me) =>
          invite ? navigate(HOME_PATH[me.role], { replace: true }) : navigate('/login?reset=1', { replace: true }),
      },
    )
  }

  return (
    <>
      <div className="auth-brand">
        <span className="auth-logo">{invite ? <Logo /> : <KeyRound strokeWidth={1.75} aria-hidden="true" />}</span>
        <h1 className="auth-title">
          {invite ? t('auth.welcome', { name: info.name?.split(' ')[0] }) : t('auth.newPasswordTitle')}
        </h1>
        <span className="auth-sub">{invite ? t('auth.inviteSub') : t('auth.newPasswordSub', { email: info.email })}</span>
      </div>

      <form className="stack" onSubmit={onSubmit}>
        {invite && (
          <dl className="dl dl-2" style={{ background: 'var(--color-mist)', padding: 16, borderRadius: 8 }}>
            <div>
              <dt>{t('auth.email')}</dt>
              <dd>{info.email}</dd>
            </div>
            <div>
              <dt>{t('auth.role')}</dt>
              <dd>
                {info.role && t(`role.${info.role}`)}
                {info.farm && ` · ${info.farm.name}`}
              </dd>
            </div>
          </dl>
        )}
        <label className="field">
          <span className="field-label">
            <span>
              {t('auth.newPassword')} <span className="req">*</span>
            </span>
          </span>
          <PasswordInput autoComplete="new-password" value={password} onChange={(e) => setPasswordValue(e.target.value)} />
        </label>
        <ul className="pw-rules">
          <li className={cx(rules.letterNumber && 'is-ok')}>{t('auth.ruleLetterNumber')}</li>
          <li className={cx(rules.length && 'is-ok')}>{t('auth.ruleLength')}</li>
        </ul>
        <label className="field">
          <span className="field-label">
            <span>
              {t('auth.confirmPassword')} <span className="req">*</span>
            </span>
          </span>
          <PasswordInput
            autoComplete="new-password"
            invalid={confirm.length > 0 && !matches}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </label>
        {setPassword.isError && <span className="helper is-error">{t('auth.unexpected')}</span>}
        <button className="btn btn--primary btn--lg btn--block" disabled={!ready || setPassword.isPending}>
          {invite ? t('auth.setAndSignIn') : t('auth.resetPassword')}
        </button>
        <span className="helper" style={{ textAlign: 'center' }}>
          {t('auth.enabledHelp')}
        </span>
      </form>
    </>
  )
}

function ExpiredLink() {
  const { t } = useTranslation()
  return (
    <AuthLayout>
      <div className="auth-brand">
        <span className="auth-logo">
          <KeyRound strokeWidth={1.75} aria-hidden="true" />
        </span>
        <h1 className="auth-title">{t('auth.newPasswordTitle')}</h1>
      </div>
      <div className="stack">
        <div className="notice notice--warning" role="alert">
          <Icon icon={Clock} />
          <span>{t('auth.linkExpired')}</span>
        </div>
        <Link className="btn btn--primary btn--lg btn--block" to="/forgot-password">
          {t('auth.requestNewLink')}
        </Link>
        <span className="helper" style={{ textAlign: 'center' }}>
          {t('auth.expiredInviteHelp')}
        </span>
      </div>
    </AuthLayout>
  )
}
