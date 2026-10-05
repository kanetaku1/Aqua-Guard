import { useEffect, type ReactNode } from 'react'
import type { Me } from '@/api/types'
import i18n, { changeLanguage } from '@/i18n'
import { GlobalHeader } from './GlobalHeader'
import { Sidebar } from './Sidebar'

/** Global Header + Role sidebar + page area (05 §3 common layout). */
export function AppShell({ me, children }: { me: Me; children: ReactNode }) {
  // After sign-in the user's own language wins over the one chosen on the sign-in page (07 §12)
  useEffect(() => {
    if (me.language && me.language !== i18n.language) void changeLanguage(me.language)
  }, [me.language])
  return (
    <>
      <GlobalHeader me={me} />
      <div className="shell">
        <Sidebar role={me.role} />
        <main className="main">
          <div className="page">{children}</div>
        </main>
      </div>
    </>
  )
}
