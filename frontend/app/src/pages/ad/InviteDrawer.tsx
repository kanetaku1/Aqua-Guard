import { Mail, Send } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { isApiError } from '@/api/client'
import { useInviteUser } from '@/api/queries/admin'
import type { components } from '@/api/schema'
import { Drawer } from '@/components/Drawer'
import { Icon } from '@/components/Icon'
import { cx } from '@/lib/cx'
import { fieldError } from './fieldError'
import { FarmField, LanguageField } from './userFields'

type S = components['schemas']
const ROLES: S['Role'][] = ['farms_manager', 'technical_manager', 'system_administrator']
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Invite user drawer (AD-U-002): the invitation link is valid for 72 hours. */
export function InviteDrawer({ onClose, onDone }: { onClose: () => void; onDone: (message: string) => void }) {
  const { t } = useTranslation()
  const invite = useInviteUser()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<S['Role'] | null>(null)
  const [farmId, setFarmId] = useState('')
  const [language, setLanguage] = useState<S['Language']>('id')
  const [tried, setTried] = useState(false)

  const errors = {
    name: !name.trim() ? t('adUsers.field.nameRequired') : undefined,
    email: !EMAIL.test(email.trim()) ? t('adUsers.field.emailInvalid') : undefined,
    role: !role ? t('adUsers.field.roleRequired') : undefined,
    farmId: role === 'technical_manager' && !farmId ? t('adUsers.field.farmRequired') : undefined,
  }
  // Client checks first; the server's field messages (e.g. email already used) after a failed send
  const shown = (field: keyof typeof errors) => (tried ? errors[field] : undefined) ?? fieldError(invite.error, field)

  const send = () => {
    setTried(true)
    if (Object.values(errors).some(Boolean)) return
    invite.mutate(
      { name: name.trim(), email: email.trim(), role: role!, farmId: role === 'technical_manager' ? farmId : null, language },
      { onSuccess: (u) => (onDone(t('adUsers.invited', { email: u.email })), onClose()) },
    )
  }
  const otherError = invite.isError && !['name', 'email', 'role', 'farmId'].some((f) => fieldError(invite.error, f))

  return (
    <Drawer
      title={t('adUsers.invite')}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn--outline" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button type="button" className="btn btn--primary" disabled={invite.isPending} onClick={send}>
            <Icon icon={Send} />
            {t('adUsers.sendInvitation')}
          </button>
        </>
      }
    >
      <label className="field">
        <span className="field-label">
          <span>
            {t('adUsers.field.name')} <span className="req">*</span>
          </span>
        </span>
        <input className={cx('input', shown('name') && 'is-error')} value={name} onChange={(e) => setName(e.target.value)} />
        {shown('name') && <span className="helper is-error">{shown('name')}</span>}
      </label>
      <label className="field">
        <span className="field-label">
          <span>
            {t('adUsers.field.email')} <span className="req">*</span>
          </span>
        </span>
        <input className={cx('input', shown('email') && 'is-error')} type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        {shown('email') && <span className="helper is-error">{shown('email')}</span>}
      </label>

      <div className="field">
        <span className="field-label" id="invite-role">
          <span>
            {t('adUsers.field.role')} <span className="req">*</span>
          </span>
        </span>
        <div className="choice-list" role="radiogroup" aria-labelledby="invite-role">
          {ROLES.map((r) => (
            <button
              key={r}
              type="button"
              role="radio"
              aria-checked={role === r}
              className={cx('choice', role === r && 'is-on')}
              // A button for keyboard / screen readers; reset the browser's button look so `.choice` shows as in 08
              style={{ textAlign: 'left', font: 'inherit', color: 'inherit', ...(role === r ? {} : { background: 'var(--color-white)' }) }}
              onClick={() => setRole(r)}
            >
              <span className={cx('radio', role === r && 'is-on')} />
              <span>
                <b>{t(`role.${r}`)}</b>
                <br />
                <span className="caption">{t(`adUsers.roleHelp.${r}`)}</span>
              </span>
            </button>
          ))}
        </div>
        {shown('role') && <span className="helper is-error">{shown('role')}</span>}
      </div>

      {role === 'technical_manager' && <FarmField value={farmId} onChange={setFarmId} error={shown('farmId')} />}
      <LanguageField value={language} onChange={setLanguage} />
      <div className="notice">
        <Icon icon={Mail} />
        <span>{t('adUsers.inviteNotice')}</span>
      </div>
      {otherError && <span className="helper is-error">{isApiError(invite.error) ? invite.error.problem?.title : t('adUsers.failed')}</span>}
    </Drawer>
  )
}
