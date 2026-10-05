import { HttpResponse } from 'msw'
import type { Role } from '@/api/types'
import { users } from './data'

/** Match `/api/v1/...` on any origin (browser dev server and jsdom tests). */
export const api = (path: string) => `*/api/v1${path}`

/** RFC 9457 problem response. */
export function problem(status: number, code: string, title: string, extra: Record<string, unknown> = {}) {
  return HttpResponse.json({ type: 'about:blank', title, status, code, ...extra }, {
    status,
    headers: { 'Content-Type': 'application/problem+json' },
  })
}

// Session: the signed-in mock user id, kept in localStorage so a page reload stays signed in.
const SESSION_KEY = 'aquaguard.mock.session'
let memorySession: string | null = null

export function setSession(userId: string | null) {
  memorySession = userId
  try {
    if (userId) localStorage.setItem(SESSION_KEY, userId)
    else localStorage.removeItem(SESSION_KEY)
  } catch {
    // No storage (private mode): the in-memory session still works until reload.
  }
}

export function currentUser() {
  let id = memorySession
  try {
    id = localStorage.getItem(SESSION_KEY) ?? memorySession
  } catch {
    // Use the in-memory session.
  }
  return users.find((u) => u.id === id && u.status === 'active') ?? null
}

/**
 * Server-side RBAC in the mock (02): returns a problem response when the caller may not
 * access the Farm, otherwise null. FM may read every Farm; TM only the assigned Farm.
 */
export function denyFarmAccess(farmId: string, roles: Role[]) {
  const user = currentUser()
  if (!user) return problem(401, 'unauthenticated', 'Not signed in')
  if (!roles.includes(user.role)) return problem(403, 'forbidden', 'Not allowed for this role')
  if (user.role === 'technical_manager' && user.farm?.id !== farmId) return problem(404, 'not_found', 'Farm not found')
  return null
}
