import createClient from 'openapi-fetch'
import i18n from '@/i18n'
import type { paths } from './schema'
import type { Problem } from './types'

/**
 * Typed client for api/openapi.frontend.yaml (shared docs/api/openapi.yaml + frontend additions). Types are generated with `npm run gen:api`.
 * `fetch` is resolved per call so MSW (tests) can patch the global after import.
 */
export const api = createClient<paths>({
  baseUrl: new URL('/api/v1', globalThis.location?.origin ?? 'http://localhost').href,
  credentials: 'include',
  fetch: (request) => globalThis.fetch(request),
  querySerializer: { array: { style: 'form', explode: false } },
})

// The UI language, so the backend can return its own sentences (alert titles, summary facts) in it (GLOSSARY-id.md)
api.use({
  onRequest({ request }) {
    request.headers.set('Accept-Language', i18n.language === 'id' ? 'id' : 'en')
    return request
  },
})

/** Error thrown for non-2xx responses; carries the RFC 9457 problem body. */
export class ApiError extends Error {
  readonly status: number
  readonly problem: Problem | undefined

  constructor(status: number, problem: Problem | undefined) {
    super(problem?.title ?? `Request failed (${status})`)
    this.name = 'ApiError'
    this.status = status
    this.problem = problem
  }

  get code(): string | undefined {
    return this.problem?.code
  }
}

export const isApiError = (error: unknown, status?: number): error is ApiError =>
  error instanceof ApiError && (status === undefined || error.status === status)

/** Return `data`, or throw an ApiError for any error response. */
export function unwrap<T>(result: { data?: T; error?: unknown; response: Response }): T {
  if (!result.response.ok) throw new ApiError(result.response.status, result.error as Problem | undefined)
  return result.data as T
}
