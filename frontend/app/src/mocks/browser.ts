import { setupWorker } from 'msw/browser'
import { handlers } from './handlers'

/** Dev only (`npm run dev:mock`): serves /api/v1 from the handlers instead of the backend. */
export const worker = setupWorker(...handlers)
