import { Search, UserPlus } from 'lucide-react'
import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router'
import { useAdminFarms, useAdminUsers } from '@/api/queries/admin'
import { useCurrentUser } from '@/api/queries/auth'
import type { components } from '@/api/schema'
import { Pagination } from '@/components/Controls'
import { Icon } from '@/components/Icon'
import { PageHeader } from '@/components/Page'
import { QueryState } from '@/components/QueryState'
import { Toast } from '@/components/Toast'
import { useDocumentTitle } from '@/components/useDocumentTitle'
import { cx } from '@/lib/cx'
import { formatDayMonth, formatDayTime } from '@/lib/format'
import { InviteDrawer } from './InviteDrawer'
import { UserDrawer } from './UserDrawer'

type S = components['schemas']
const PAGE_SIZE = 20
const ROLES: S['Role'][] = ['system_administrator', 'farms_manager', 'technical_manager']
const STATUSES: S['UserStatus'][] = ['active', 'invited', 'deactivated']

/**
 * AD-01 Users (05 §5B AD-01, 06 AD-01, wireframe sa-users.png): invite users, assign the Role and Farm, deactivate.
 * Filters and the open drawer live in the URL (`?q= &role= &status= &farm=`, `?user=<id>`, `?invite=1`).
 * No business data on System Administrator screens.
 */
export function AdUsers() {
  useDocumentTitle('AD-01 Users')
  const { t } = useTranslation()
  const me = useCurrentUser()
  const [params, setParams] = useSearchParams()
  const [page, setPage] = useState(1)
  const [toast, setToast] = useState<string | null>(null)
  const clearToast = useCallback(() => setToast(null), [])

  const q = params.get('q') ?? ''
  const role = (ROLES as string[]).includes(params.get('role') ?? '') ? (params.get('role') as S['Role']) : undefined
  const status = (STATUSES as string[]).includes(params.get('status') ?? '') ? (params.get('status') as S['UserStatus']) : undefined
  const farmId = params.get('farm') || undefined
  const users = useAdminUsers({ q: q.trim() || undefined, role, status, farmId, page, pageSize: PAGE_SIZE })
  const farms = useAdminFarms()
  const openUserId = params.get('user')
  const inviting = params.get('invite') === '1'

  const setParam = (key: string, value: string | null, replace = true) => {
    if (['q', 'role', 'status', 'farm'].includes(key)) setPage(1)
    setParams(
      (p) => {
        if (value) p.set(key, value)
        else p.delete(key)
        return p
      },
      { replace },
    )
  }
  const closeDrawer = () =>
    setParams(
      (p) => {
        p.delete('user')
        p.delete('invite')
        return p
      },
      { replace: true },
    )
  const counts = users.data?.counts

  return (
    <>
      <PageHeader
        title={t('adUsers.title')}
        meta={counts && <span>{t('adUsers.meta', { total: counts.total, active: counts.active, invited: counts.invited, deactivated: counts.deactivated })}</span>}
        actions={
          <button type="button" className="btn btn--primary" onClick={() => setParam('invite', '1', false)}>
            <Icon icon={UserPlus} />
            {t('adUsers.invite')}
          </button>
        }
      />

      <div className="filter-bar">
        <div className="input-search">
          <Icon icon={Search} />
          <input className="input" placeholder={t('adUsers.search')} aria-label={t('adUsers.search')} value={q} onChange={(e) => setParam('q', e.target.value)} />
        </div>
        <select className="select" aria-label={t('adUsers.col.role')} value={role ?? ''} onChange={(e) => setParam('role', e.target.value)}>
          <option value="">{t('adUsers.roleAll')}</option>
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {t(`role.${r}`)}
            </option>
          ))}
        </select>
        <select className="select" aria-label={t('adUsers.col.status')} value={status ?? ''} onChange={(e) => setParam('status', e.target.value)}>
          <option value="">{t('adUsers.statusAll')}</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {t(`userStatus.${s}`)}
            </option>
          ))}
        </select>
        <select className="select" aria-label={t('adUsers.col.farm')} value={farmId ?? ''} onChange={(e) => setParam('farm', e.target.value)}>
          <option value="">{t('adUsers.farmAll')}</option>
          {farms.data?.items.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
      </div>

      <section className="card">
        <QueryState query={users}>
          {(data) => {
            const pageCount = Math.max(1, Math.ceil(data.total / PAGE_SIZE))
            const from = data.total === 0 ? 0 : (data.page - 1) * PAGE_SIZE + 1
            const to = Math.min(data.page * PAGE_SIZE, data.total)
            return (
              <>
                <table className="table">
                  <thead>
                    <tr>
                      <th>{t('adUsers.col.user')}</th>
                      <th>{t('adUsers.col.role')}</th>
                      <th>{t('adUsers.col.farm')}</th>
                      <th>{t('adUsers.col.status')}</th>
                      <th>{t('adUsers.col.lastSignIn')}</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {data.items.length === 0 ? (
                      <tr>
                        <td colSpan={6}>
                          <div className="empty">
                            <span className="empty-title">{t('adUsers.none')}</span>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      data.items.map((u) => (
                        <tr
                          key={u.id}
                          className={cx('is-link', u.status === 'deactivated' && 'is-muted', u.id === openUserId && 'is-selected')}
                          onClick={() => setParam('user', u.id, false)}
                        >
                          <td>
                            <div className="cell-main">
                              {u.name}
                              {u.id === me.id && <span className="caption"> {t('adUsers.you')}</span>}
                            </div>
                            <div className="cell-sub">{u.email}</div>
                          </td>
                          <td>{t(`role.${u.role}`)}</td>
                          <td className={cx(u.role === 'system_administrator' && 'text-muted')}>
                            {u.role === 'farms_manager' ? t('adUsers.allFarms') : (u.farm?.name ?? '—')}
                          </td>
                          <td>
                            <UserStatusText status={u.status} />
                          </td>
                          <td className={cx(u.status === 'invited' && 'text-muted')}>{lastSignIn(u, t)}</td>
                          <td className="actions">
                            <button
                              type="button"
                              className="btn btn--link"
                              aria-label={t('adUsers.viewUser', { name: u.name })}
                              onClick={(e) => {
                                e.stopPropagation()
                                setParam('user', u.id, false)
                              }}
                            >
                              {t('common.view')}
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
                <div className="card-footer" style={{ justifyContent: 'space-between' }}>
                  <span className="caption">{t('adUsers.showing', { from, to, total: data.total })}</span>
                  <Pagination page={data.page} pageCount={pageCount} onChange={setPage} />
                </div>
              </>
            )
          }}
        </QueryState>
      </section>

      {openUserId && <UserDrawer key={openUserId} userId={openUserId} onClose={closeDrawer} onDone={setToast} />}
      {inviting && <InviteDrawer onClose={closeDrawer} onDone={setToast} />}
      {toast && <Toast message={toast} onDone={clearToast} />}
    </>
  )
}

/** Active = Normal indicator, Invited = in progress (blue), Deactivated = neutral and muted (06 AD-01). */
export function UserStatusText({ status }: { status: S['UserStatus'] }) {
  const { t } = useTranslation()
  const cls = status === 'active' ? 'st--normal' : status === 'invited' ? 'st--progress' : 'st--neutral st--muted'
  return <span className={cx('status-text', cls)}>{t(`userStatus.${status}`)}</span>
}

/** "29 Sep 09:20", or for an invitation "Invited 28 Sep · expires 1 Oct". */
function lastSignIn(u: S['AdminUser'], t: (key: string, o?: Record<string, unknown>) => string) {
  if (u.status === 'invited' && u.invitedAt) {
    return t('adUsers.invitedExpires', {
      invited: formatDayMonth(u.invitedAt),
      expires: u.invitationExpiresAt ? formatDayMonth(u.invitationExpiresAt) : '—',
    })
  }
  return u.lastSignInAt ? formatDayTime(u.lastSignInAt) : '—'
}
