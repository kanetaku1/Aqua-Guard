import { setupServer } from 'msw/node'
import { handlers } from './handlers'

/** Tests: same handlers as the browser mock. */
export const server = setupServer(...handlers)
