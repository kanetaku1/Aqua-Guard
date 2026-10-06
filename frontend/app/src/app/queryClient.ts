import { QueryCache, QueryClient } from '@tanstack/react-query'
import { isApiError } from '@/api/client'
import { meKey } from '@/api/queries/auth'
import { markSessionExpired } from '@/auth/session'

/**
 * A 401 from any data query means the session ended (12 h inactivity): clear the user so
 * <RequireRole> sends them to Login, which then brings them back to the same screen (AU-01).
 */
export function createQueryClient() {
  const client: QueryClient = new QueryClient({
    queryCache: new QueryCache({
      onError: (error, query) => {
        if (isApiError(error, 401) && query.queryKey[0] !== meKey[0]) {
          markSessionExpired()
          client.setQueryData(meKey, null)
        }
      },
    }),
    defaultOptions: {
      queries: {
        retry: (count, error) => !isApiError(error) && count < 2,
        refetchOnWindowFocus: true,
      },
    },
  })
  return client
}
