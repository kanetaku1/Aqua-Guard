import { Mail, Send, TriangleAlert, UserCheck, UserX } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { isApiError } from '@/api/client'
import { useAdminUser, useUserMutations } from '@/api/queries/admin'
import { useCurrentUser } from '@/api/queries/auth'
import type { components } from '@/api/schema'
import { ConfirmDialog } from '@/components/Controls'
import { Drawer } from '@/components/Drawer'
import { Icon } from '@/components/Icon'
import { QueryState } from '@/components/QueryState'
import { formatDate, formatDateTime } from '@/lib/format'
import { UserStatusText } from './Users'
import { fieldError } from './fieldError'
import { FarmField, LanguageField } from './userFields'

type S = components['schemas']
const ROLES: S['Role'][] = ['technical_manager', 'farms_manager', 'system_administrator']

/** User Detail drawer (AD-U-003〜005): Role / Farm / Language, account info, password reset, deactivate. */
export function UserDrawer({ userId, onClose, onDone }: { userId: string; onClose: () => void; onDone: (message: string) => void }) {
  const { t } = useTranslation()
  const user = useAdminUser(userId)
  const u = user.data
  // Remount the form when the saved values change (e.g. after Deactivate) so its fields show the server state
  if (u) return <UserForm key={`${u.role}|${u.farm?.id}|${u.language}|${u.status}`} user={u} onClose={onClose} onDone={onDone} />
  return (
    <Drawer caption={t('adUsers.user')} title="…" onClose={onClose}>
      <QueryState query={user}>{() => null}</QueryState>
    </Drawer>
  )
}

function UserForm({ user: u, onClose, onDone }: { user: S['AdminUser']; onClose: () => void; onDone: (message: string) => void }) {
  const { t } = useTranslation()
  const { update, resendInvitation, sendPasswordReset, deactivate, reactivate } = useUserMutations(u.id)
  const self = useCurrentUser().id === u.id
  const [role, setRole] = useState(u.role)
  const [farmId, setFarmId] = useState(u.farm?.id ?? '')
  const [language, setLanguage] = useState(u.language)
  const [tried, setTried] = useState(false)
  const [confirming, setConfirming] = useState(false)

  const isTm = role === 'technical_manager'
  const dirty = role !== u.role || (isTm && farmId !== (u.farm?.id ?? '')) || language !== u.language
  const farmMissing = isTm && !farmId
  // Leaving Farm X without an active TM: by Role change or by moving to another Farm
  const leavesFarm = u.onlyActiveTechnicalManagerOf && (role !== 'technical_manager' || farmId !== u.onlyActiveTechnicalManagerOf.id) ? u.onlyActiveTechnicalManagerOf : null
  const deactivated = u.status === 'deactivated'

  const save = () => {
    setTried(true)
    if (farmMissing) return
    update.mutate(
      { role, farmId: isTm ? farmId : null, language },
      { onSuccess: () => (onDone(t('adUsers.saved', { name: u.name })), onClose()) },
    )
  }
  const accountError = [resendInvitation, sendPasswordReset, deactivate, reactivate].find((m) => m.isError)?.error
  const roleLocked = !u.canChangeRole

  return (
    <>
      <Drawer
        caption={t('adUsers.user')}
        title={u.name}
        onClose={onClose}
        footer={
          <>
            <button type="button" className="btn btn--outline" onClick={onClose}>
              {t('common.cancel')}
            </button>
            <button type="button" className="btn btn--primary" disabled={!dirty || update.isPending} onClick={save}>
              {t('adUsers.saveChanges')}
            </button>
          </>
        }
      >
        <div className="row">
          <UserStatusText status={u.status} />
          <span className="caption">{u.email}</span>
        </div>

        <label className="field">
          <span className="field-label">
            <span>
              {t('adUsers.field.role')} <span className="req">*</span>
            </span>
          </span>
          <select className="select" value={role} disabled={roleLocked} onChange={(e) => setRole(e.target.value as S['Role'])}>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {t(`role.${r}`)}
              </option>
            ))}
          </select>
          {roleLocked && <span className="helper">{t(self ? 'adUsers.lockedSelf' : 'adUsers.lockedLastAdmin')}</span>}
        </label>
        {isTm && <FarmField value={farmId} onChange={setFarmId} error={(tried && farmMissing ? t('adUsers.field.farmRequired') : undefined) ?? fieldError(update.error, 'farmId')} />}
        <LanguageField value={language} onChange={setLanguage} />
        {leavesFarm && dirty && <SoleTmNotice farm={leavesFarm.name} kind="change" />}
        {update.isError && !fieldError(update.error, 'farmId') && <span className="helper is-error">{errorText(update.error, t)}</span>}

        <hr className="divider" />
        <dl className="dl dl-2">
          <div>
            <dt>{t('adUsers.info.invited')}</dt>
            <dd>{u.invitedAt ? (u.invitedBy ? t('adUsers.info.invitedBy', { date: formatDate(u.invitedAt), name: u.invitedBy.name }) : formatDate(u.invitedAt)) : '—'}</dd>
          </div>
          {u.status === 'invited' ? (
            <div>
              <dt>{t('adUsers.info.expires')}</dt>
              <dd>{u.invitationExpiresAt ? formatDateTime(u.invitationExpiresAt) : '—'}</dd>
            </div>
          ) : (
            <div>
              <dt>{t('adUsers.info.activated')}</dt>
              <dd>{u.activatedAt ? formatDate(u.activatedAt) : '—'}</dd>
            </div>
          )}
          <div>
            <dt>{t('adUsers.info.lastSignIn')}</dt>
            <dd>{u.lastSignInAt ? formatDateTime(u.lastSignInAt) : '—'}</dd>
          </div>
          <div>
            <dt>{t('adUsers.info.failedSignIns')}</dt>
            <dd>{u.failedSignIns}</dd>
          </div>
        </dl>

        <hr className="divider" />
        <div className="stack" style={{ gap: 8 }}>
          <span className="subsection-title" style={{ margin: 0 }}>
            {t('adUsers.account')}
          </span>
          <div className="row">
            {u.status === 'invited' && (
              <button
                type="button"
                className="btn btn--outline btn--sm"
                disabled={resendInvitation.isPending}
                onClick={() => resendInvitation.mutate(undefined, { onSuccess: () => onDone(t('adUsers.resent', { email: u.email })) })}
              >
                <Icon icon={Send} />
                {t('adUsers.resend')}
              </button>
            )}
            {u.status === 'active' && (
              <button
                type="button"
                className="btn btn--outline btn--sm"
                disabled={sendPasswordReset.isPending}
                onClick={() => sendPasswordReset.mutate(undefined, { onSuccess: () => onDone(t('adUsers.resetSent', { email: u.email })) })}
              >
                <Icon icon={Mail} />
                {t('adUsers.sendReset')}
              </button>
            )}
            {deactivated ? (
              <button
                type="button"
                className="btn btn--outline btn--sm"
                disabled={reactivate.isPending}
                onClick={() => reactivate.mutate(undefined, { onSuccess: () => onDone(t('adUsers.reactivated', { name: u.name })) })}
              >
                <Icon icon={UserCheck} />
                {t('adUsers.reactivate')}
              </button>
            ) : (
              <button type="button" className="btn btn--outline btn--sm" disabled={!u.canDeactivate} onClick={() => setConfirming(true)}>
                <Icon icon={UserX} />
                {t('adUsers.deactivate')}
              </button>
            )}
          </div>
          <span className="helper">
            {deactivated ? t('adUsers.reactivateHelp') : !u.canDeactivate ? t(self ? 'adUsers.cannotDeactivateSelf' : 'adUsers.lockedLastAdmin') : t('adUsers.deactivateHelp')}
          </span>
          {accountError !== undefined && <span className="helper is-error">{errorText(accountError, t)}</span>}
        </div>
      </Drawer>

      {confirming && (
        <ConfirmDialog
          danger
          title={t('adUsers.confirm.title', { name: u.name })}
          confirmLabel={t('adUsers.confirm.deactivate')}
          busy={deactivate.isPending}
          onCancel={() => setConfirming(false)}
          onConfirm={() =>
            deactivate.mutate(undefined, {
              onSuccess: () => {
                setConfirming(false)
                onDone(t('adUsers.deactivated', { name: u.name }))
              },
              onError: () => setConfirming(false),
            })
          }
        >
          <p className="text-muted">{t('adUsers.confirm.body', { name: u.name.split(' ')[0] })}</p>
          {u.onlyActiveTechnicalManagerOf && <SoleTmNotice farm={u.onlyActiveTechnicalManagerOf.name} kind="deactivate" />}
        </ConfirmDialog>
      )}
    </>
  )
}

/** "Farm A will have no active Technical Manager." (06 AD-01) */
function SoleTmNotice({ farm, kind }: { farm: string; kind: 'deactivate' | 'change' }) {
  const { t } = useTranslation()
  return (
    <div className="notice notice--warning">
      <Icon icon={TriangleAlert} />
      <span>{t(kind === 'deactivate' ? 'adUsers.soleTm.deactivate' : 'adUsers.soleTm.change', { farm })}</span>
    </div>
  )
}

function errorText(error: unknown, t: (key: string) => string) {
  return isApiError(error) && error.status !== 500 ? (error.problem?.title ?? t('adUsers.failed')) : t('adUsers.failed')
}
