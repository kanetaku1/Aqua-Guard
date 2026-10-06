import { useQuery } from '@tanstack/react-query'
import { api, unwrap } from '../client'
import { liveQuery } from '../refresh'

/** Unresolved alerts of a Farm (TM-01 Active Alerts). */
export function useOpenAlerts(farmId: string) {
  return useQuery({
    queryKey: ['alerts', { farmId, state: 'open' }],
    queryFn: async () =>
      unwrap(await api.GET('/alerts', { params: { query: { farmId, state: ['open'], pageSize: 100 } } })),
    ...liveQuery,
  })
}
