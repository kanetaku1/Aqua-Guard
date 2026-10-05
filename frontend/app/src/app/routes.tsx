import type { ComponentType } from 'react'
import type { RouteObject } from 'react-router'
import type { Role } from '@/api/types'
import { HomeRedirect, RequireRole } from '@/auth/RequireRole'
import { ForgotPassword } from '@/pages/auth/ForgotPassword'
import { Login } from '@/pages/auth/Login'
import { Logout } from '@/pages/auth/Logout'
import { SetPassword } from '@/pages/auth/SetPassword'
import { FmDashboard } from '@/pages/fm/Dashboard'
import { FmFarmDetail } from '@/pages/fm/FarmDetail'
import { FmFarms } from '@/pages/fm/Farms'
import { FmDailyReport } from '@/pages/fm/DailyReportView'
import { FmReports } from '@/pages/fm/Reports'
import { FmWeeklyReport } from '@/pages/fm/WeeklyReportView'
import { AdFarmDetail } from '@/pages/ad/FarmDetail'
import { AdFarms } from '@/pages/ad/Farms'
import { AdSettings } from '@/pages/ad/Settings'
import { AdUsers } from '@/pages/ad/Users'
import { Placeholder } from '@/pages/Placeholder'
import { SCREENS } from '@/pages/screens'
import { TmDashboard } from '@/pages/tm/Dashboard'
import { TmPondDetail } from '@/pages/tm/pond/PondDetail'
import { TmPonds } from '@/pages/tm/Ponds'
import { TmDailyReport } from '@/pages/tm/reports/DailyReport'
import { TmWeeklyReport } from '@/pages/tm/reports/WeeklyReport'

/** Built screens; every other screen in SCREENS renders a Placeholder. */
const PAGES: Record<string, ComponentType> = {
  'FM-01': FmDashboard,
  'FM-02': FmFarms,
  'FM-03': FmFarmDetail,
  'FM-04': FmReports,
  'FM-05': FmDailyReport,
  'FM-06': FmWeeklyReport,
  'TM-01': TmDashboard,
  'TM-02': TmPonds,
  'TM-03': TmPondDetail,
  'TM-04': TmDailyReport,
  'TM-05': TmWeeklyReport,
  'AD-01': AdUsers,
  'AD-02': AdFarms,
  'AD-03': AdFarmDetail,
  'AD-04': AdSettings,
}

const ROLES: Role[] = ['farms_manager', 'technical_manager', 'system_administrator']

export const routes: RouteObject[] = [
  { path: '/', element: <HomeRedirect /> },
  { path: '/login', element: <Login /> },
  { path: '/logout', element: <Logout /> },
  { path: '/forgot-password', element: <ForgotPassword /> },
  { path: '/set-password', element: <SetPassword /> },
  ...ROLES.map((role) => ({
    element: <RequireRole role={role} />,
    children: SCREENS.filter((s) => s.role === role).map((screen) => {
      const Page = PAGES[screen.id]
      return { path: screen.path, element: Page ? <Page /> : <Placeholder screen={screen} /> }
    }),
  })),
  { path: '*', element: <HomeRedirect /> },
]
