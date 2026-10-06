import type { Role } from '@/api/types'

/**
 * Screens per Role (05 §2.2). `prototype` is the agreed design in frontend/prototype/screens.
 * Screens without a React page yet render <Placeholder>.
 */
export type ScreenDef = { id: string; title: string; path: string; role: Role; prototype: string }

export const SCREENS: ScreenDef[] = [
  { id: 'FM-01', title: 'Dashboard', path: '/fm/dashboard', role: 'farms_manager', prototype: 'fm-dashboard.html' },
  { id: 'FM-02', title: 'Farm List', path: '/fm/farms', role: 'farms_manager', prototype: 'fm-farms.html' },
  { id: 'FM-03', title: 'Farm Detail', path: '/fm/farms/:farmId', role: 'farms_manager', prototype: 'fm-farm-detail.html' },
  { id: 'FM-04', title: 'Report List', path: '/fm/reports', role: 'farms_manager', prototype: 'fm-reports.html' },
  { id: 'FM-05', title: 'Daily Report Detail', path: '/fm/reports/daily/:reportId', role: 'farms_manager', prototype: 'fm-daily-report.html' },
  { id: 'FM-06', title: 'Weekly Report Detail', path: '/fm/reports/weekly/:reportId', role: 'farms_manager', prototype: 'fm-weekly-report.html' },
  { id: 'TM-01', title: 'Dashboard', path: '/tm/dashboard', role: 'technical_manager', prototype: 'tm-dashboard.html' },
  { id: 'TM-02', title: 'Pond List', path: '/tm/ponds', role: 'technical_manager', prototype: 'tm-ponds.html' },
  { id: 'TM-03', title: 'Pond Detail', path: '/tm/ponds/:pondId', role: 'technical_manager', prototype: 'tm-pond-detail.html' },
  { id: 'TM-04', title: 'Daily Report', path: '/tm/reports/daily', role: 'technical_manager', prototype: 'tm-daily-report.html' },
  { id: 'TM-05', title: 'Weekly Report', path: '/tm/reports/weekly', role: 'technical_manager', prototype: 'tm-weekly-report.html' },
  { id: 'AD-01', title: 'Users', path: '/ad/users', role: 'system_administrator', prototype: 'ad-users.html' },
  { id: 'AD-02', title: 'Farm List', path: '/ad/farms', role: 'system_administrator', prototype: 'ad-farms.html' },
  { id: 'AD-03', title: 'Farm Detail', path: '/ad/farms/:farmId', role: 'system_administrator', prototype: 'ad-farm-detail.html' },
  { id: 'AD-04', title: 'Settings', path: '/ad/settings', role: 'system_administrator', prototype: 'ad-settings.html' },
]
