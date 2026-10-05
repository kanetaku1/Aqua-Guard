import type { ReactNode } from 'react'
import type { Me } from '@/api/types'
import { GlobalHeader } from './GlobalHeader'
import { Sidebar } from './Sidebar'

/** Global Header + Role sidebar + page area (05 §3 common layout). */
export function AppShell({ me, children }: { me: Me; children: ReactNode }) {
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
