import { isApiError } from '@/api/client'

/** The server's message for one field (422 / 409 `fieldErrors`), if any. */
export function fieldError(error: unknown, field: string): string | undefined {
  return isApiError(error) ? error.problem?.fieldErrors?.find((f) => f.field === field)?.message : undefined
}
