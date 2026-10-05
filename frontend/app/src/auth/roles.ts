import type { Role } from '@/api/types'

/** URL prefix per Role — matches the prototype file prefixes (fm-*, tm-*, ad-*). */
export const ROLE_PREFIX: Record<Role, 'fm' | 'tm' | 'ad'> = {
  farms_manager: 'fm',
  technical_manager: 'tm',
  system_administrator: 'ad',
}

/** First screen after sign-in (AU-005). */
export const HOME_PATH: Record<Role, string> = {
  farms_manager: '/fm/dashboard',
  technical_manager: '/tm/dashboard',
  system_administrator: '/ad/users',
}

/** Only follow `next` to an in-app path that belongs to the signed-in Role. */
export function safeNext(next: string | null, role: Role): string {
  if (next && next.startsWith(`/${ROLE_PREFIX[role]}/`) && !next.startsWith('//')) return next
  return HOME_PATH[role]
}
