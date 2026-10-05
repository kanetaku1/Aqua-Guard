import { FileText, LayoutDashboard, Settings, Users, Warehouse, Waves, type LucideIcon } from 'lucide-react'
import type { Role } from '@/api/types'

/** `match`: also active on paths under this prefix (e.g. a report detail page). */
export type NavSub = { labelKey: string; to: string; match?: string }
export type NavItem = { key: string; labelKey: string; icon: LucideIcon; to: string; match: string; sub?: NavSub[] }

/** Sidebar per Role — ported from prototype/assets/layout.js `NAV` (05 §2.1). */
export const NAV: Record<Role, NavItem[]> = {
  farms_manager: [
    { key: 'dashboard', labelKey: 'nav.dashboard', icon: LayoutDashboard, to: '/fm/dashboard', match: '/fm/dashboard' },
    { key: 'farms', labelKey: 'nav.farms', icon: Warehouse, to: '/fm/farms', match: '/fm/farms' },
    {
      key: 'reports',
      labelKey: 'nav.reports',
      icon: FileText,
      to: '/fm/reports',
      match: '/fm/reports',
      sub: [
        { labelKey: 'nav.dailyReports', to: '/fm/reports', match: '/fm/reports/daily/' },
        { labelKey: 'nav.weeklyReports', to: '/fm/reports?type=weekly', match: '/fm/reports/weekly/' },
      ],
    },
  ],
  technical_manager: [
    { key: 'dashboard', labelKey: 'nav.dashboard', icon: LayoutDashboard, to: '/tm/dashboard', match: '/tm/dashboard' },
    { key: 'ponds', labelKey: 'nav.ponds', icon: Waves, to: '/tm/ponds', match: '/tm/ponds' },
    {
      key: 'reports',
      labelKey: 'nav.reports',
      icon: FileText,
      to: '/tm/reports/daily',
      match: '/tm/reports',
      sub: [
        { labelKey: 'nav.dailyReport', to: '/tm/reports/daily' },
        { labelKey: 'nav.weeklyReport', to: '/tm/reports/weekly' },
      ],
    },
  ],
  system_administrator: [
    { key: 'users', labelKey: 'nav.users', icon: Users, to: '/ad/users', match: '/ad/users' },
    { key: 'farms', labelKey: 'nav.farmsPonds', icon: Warehouse, to: '/ad/farms', match: '/ad/farms' },
    {
      key: 'settings',
      labelKey: 'nav.settings',
      icon: Settings,
      to: '/ad/settings?tab=thresholds',
      match: '/ad/settings',
      sub: [
        { labelKey: 'nav.thresholds', to: '/ad/settings?tab=thresholds' },
        { labelKey: 'nav.growthTargets', to: '/ad/settings?tab=growth' },
        { labelKey: 'nav.rules', to: '/ad/settings?tab=rules' },
      ],
    },
  ],
}

/**
 * Index of the active sub item: the one whose path and query both match,
 * else the first one on the current path (e.g. Daily Reports when `?type` is absent). -1 if none.
 */
export function activeSubIndex(subs: NavSub[], pathname: string, search: string): number {
  const have = new URLSearchParams(search)
  const parsed = subs.map((s) => {
    const [path, query = ''] = s.to.split('?')
    return { path, query: new URLSearchParams(query) }
  })
  const byPrefix = subs.findIndex((s) => s.match && pathname.startsWith(s.match))
  if (byPrefix >= 0) return byPrefix
  const exact = parsed.findIndex(
    (s) => s.path === pathname && s.query.size > 0 && [...s.query].every(([k, v]) => have.get(k) === v),
  )
  return exact >= 0 ? exact : parsed.findIndex((s) => s.path === pathname)
}
