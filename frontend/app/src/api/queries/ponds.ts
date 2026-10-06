import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, unwrap } from '../client'
import { liveQuery } from '../refresh'
import type { SamplingMeasurement } from '../types'

/** TM-02 Pond List: growth (latest sampling) and today's records. */
export function usePonds(farmId: string) {
  return useQuery({
    queryKey: ['farms', farmId, 'ponds'],
    queryFn: async () => unwrap(await api.GET('/farms/{farmId}/ponds', { params: { path: { farmId } } })),
    ...liveQuery,
  })
}

/** Weekly sampling already recorded on `date`, plus the target curve for the vs Target preview. */
export function useFarmSamplings(farmId: string, date: string) {
  return useQuery({
    queryKey: ['farms', farmId, 'samplings', date],
    queryFn: async () =>
      unwrap(await api.GET('/farms/{farmId}/samplings', { params: { path: { farmId }, query: { date } } })),
    enabled: !!date,
  })
}

export type SamplingEntry = SamplingMeasurement & { pondId: string }

/** TM-P-005: save the weekly sampling of several Ponds at once. */
export function useSaveSamplings(farmId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: { date: string; entries: SamplingEntry[] }) =>
      unwrap(await api.POST('/farms/{farmId}/samplings/batch', { params: { path: { farmId } }, body })),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['farms', farmId, 'ponds'] })
      void queryClient.invalidateQueries({ queryKey: ['farms', farmId, 'samplings'] })
      void queryClient.invalidateQueries({ queryKey: ['farms', farmId, 'production'] })
    },
  })
}
