import '@testing-library/jest-dom/vitest'
import { cleanup, configure } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, vi } from 'vitest'
import '@/i18n'
import { resetAdmin } from '@/mocks/admin'
import { resetSettings } from '@/mocks/settings'
import { resetAuthState } from '@/mocks/handlers/auth'
import { resetSamplings } from '@/mocks/handlers/ponds'
import { setSession } from '@/mocks/http'
import { resetPondStore } from '@/mocks/pondDetail'
import { resetReports } from '@/mocks/reports'
import { resetWeeklyReports } from '@/mocks/weeklyReports'
import { server } from '@/mocks/server'

configure({ asyncUtilTimeout: 3000 })

// jsdom has no ResizeObserver (used by Recharts' ResponsiveContainer)
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
}

// jsdom cannot lay out Leaflet maps
vi.mock('react-leaflet', () => import('./reactLeafletMock'))

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => {
  cleanup()
  server.resetHandlers()
  resetAuthState()
  resetAdmin()
  resetSettings()
  resetSamplings()
  resetPondStore()
  resetReports()
  resetWeeklyReports()
  setSession(null)
})
afterAll(() => server.close())
