import { useQuery } from '@tanstack/react-query'
import { api, unwrap } from '../client'
import { liveQuery } from '../refresh'

/** Header data freshness (SCR-COM-005). Not used for System Administrators. */
export function useSyncStatus(enabled = true) {
  return useQuery({
    queryKey: ['sync-status'],
    queryFn: async () => unwrap(await api.GET('/sync-status')),
    enabled,
    ...liveQuery,
  })
}
