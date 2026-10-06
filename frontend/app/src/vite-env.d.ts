/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** "true" → serve the API from MSW (src/mocks) */
  readonly VITE_USE_MOCK?: string
  /** Fixed "now" (ISO) for mock mode and tests */
  readonly VITE_MOCK_NOW?: string
}
