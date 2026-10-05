import { HttpResponse, http } from 'msw'
import { MOCK_PASSWORD, passwordTokens, users } from '../data'
import { api, currentUser, problem, setSession } from '../http'

/**
 * AU-01〜03. Any active mock user signs in with "password123".
 * 5 consecutive failures lock the account for 15 minutes (02 §7).
 */
const failures = new Map<string, number>()
const lockedUntil = new Map<string, number>()
const MAX_FAILURES = 5
const LOCK_MS = 15 * 60 * 1000

export function resetAuthState() {
  failures.clear()
  lockedUntil.clear()
}

const publicUser = (user: (typeof users)[number]) => {
  const { status: _status, ...me } = user
  return me
}

export const authHandlers = [
  http.post(api('/auth/login'), async ({ request }) => {
    const { email, password } = (await request.json()) as { email: string; password: string }
    const key = email.trim().toLowerCase()
    const until = lockedUntil.get(key)
    if (until && until > Date.now()) {
      return problem(423, 'account_locked', 'Account locked', { lockedUntil: new Date(until).toISOString() })
    }
    const user = users.find((u) => u.email === key)
    if (!user || password !== MOCK_PASSWORD) {
      const count = (failures.get(key) ?? 0) + 1
      failures.set(key, count)
      if (count >= MAX_FAILURES) {
        failures.delete(key)
        lockedUntil.set(key, Date.now() + LOCK_MS)
        return problem(423, 'account_locked', 'Account locked', {
          lockedUntil: new Date(Date.now() + LOCK_MS).toISOString(),
        })
      }
      return problem(401, 'invalid_credentials', 'Email or password is incorrect', {
        remainingAttempts: MAX_FAILURES - count,
      })
    }
    if (user.status === 'deactivated') return problem(403, 'account_deactivated', 'Account deactivated')
    failures.delete(key)
    setSession(user.id)
    return HttpResponse.json(publicUser(user))
  }),

  http.post(api('/auth/logout'), () => {
    setSession(null)
    return new HttpResponse(null, { status: 204 })
  }),

  http.get(api('/auth/me'), () => {
    const user = currentUser()
    return user ? HttpResponse.json(publicUser(user)) : problem(401, 'unauthenticated', 'Not signed in')
  }),

  http.patch(api('/auth/me'), async ({ request }) => {
    const user = currentUser()
    if (!user) return problem(401, 'unauthenticated', 'Not signed in')
    const { language } = (await request.json()) as { language?: 'en' | 'id' }
    if (language) user.language = language
    return HttpResponse.json(publicUser(user))
  }),

  http.post(api('/auth/password/forgot'), () => new HttpResponse(null, { status: 202 })),

  http.get(api('/auth/password/tokens/:token'), ({ params }) => {
    const token = passwordTokens[params.token as string]
    if (!token) return problem(404, 'not_found', 'Link not found')
    if (token === 'expired') return problem(410, 'token_expired', 'Link expired')
    return HttpResponse.json(token)
  }),

  http.post(api('/auth/password/set'), async ({ request }) => {
    const { token: key, password } = (await request.json()) as { token: string; password: string }
    const token = passwordTokens[key]
    if (!token) return problem(404, 'not_found', 'Link not found')
    if (token === 'expired') return problem(410, 'token_expired', 'Link expired')
    if (password.length < 10 || !/[a-z]/i.test(password) || !/\d/.test(password)) {
      return problem(422, 'invalid_password', 'Password does not meet the rules', {
        fieldErrors: [{ field: 'password', message: 'At least 10 characters with a letter and a number' }],
      })
    }
    if (token.mode === 'reset') {
      const user = users.find((u) => u.email === token.email)
      return user ? HttpResponse.json(publicUser(user)) : problem(404, 'not_found', 'User not found')
    }
    // Invitation: the new user is signed in right away.
    const invited = {
      id: 'u-fajar',
      name: token.name ?? '',
      initials: 'FN',
      email: token.email ?? '',
      role: token.role ?? 'technical_manager',
      language: 'en' as const,
      company: 'Nusantara Shrimp Co.',
      scopeLabel: 'Farm D · Lombok',
      farm: token.farm ?? null,
      status: 'active' as const,
    }
    if (!users.some((u) => u.id === invited.id)) users.push(invited)
    setSession(invited.id)
    return HttpResponse.json(publicUser(invited))
  }),
]
