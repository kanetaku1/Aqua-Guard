import { Navigate, Outlet, useLocation } from 'react-router'
import { useMe } from '@/api/queries/auth'
import type { Role } from '@/api/types'
import { QueryState } from '@/components/QueryState'
import { AppShell } from '@/layout/AppShell'
import { consumeSessionExpired } from './session'
import { HOME_PATH } from './roles'

/**
 * Guards a Role's screens (SCR-COM-002): no session → Login (and back here afterwards),
 * another Role → that Role's home. Renders the app shell around the matched screen.
 */
export function RequireRole({ role }: { role: Role }) {
  const meQuery = useMe()
  const location = useLocation()

  return (
    <QueryState query={meQuery}>
      {(me) => {
        if (!me) {
          const params = new URLSearchParams({ next: location.pathname + location.search })
          if (consumeSessionExpired()) params.set('expired', '1')
          return <Navigate to={`/login?${params}`} replace />
        }
        if (me.role !== role) return <Navigate to={HOME_PATH[me.role]} replace />
        return (
          <AppShell me={me}>
            <Outlet />
          </AppShell>
        )
      }}
    </QueryState>
  )
}

/** `/` → the signed-in Role's home, or Login. */
export function HomeRedirect() {
  const meQuery = useMe()
  return <QueryState query={meQuery}>{(me) => <Navigate to={me ? HOME_PATH[me.role] : '/login'} replace />}</QueryState>
}
