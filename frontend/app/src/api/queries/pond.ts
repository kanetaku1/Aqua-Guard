import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, unwrap } from '../client'
import { liveQuery } from '../refresh'
import type { components } from '../schema'
import type { SensorParameter } from '../types'

/** TM-03 Pond Detail. Every mutation refreshes the Pond's queries (and the lists that summarize them). */

type S = components['schemas']

const pondKey = (pondId: string) => ['ponds', pondId] as const

function useInvalidatePond(pondId: string) {
  const queryClient = useQueryClient()
  return () => {
    void queryClient.invalidateQueries({ queryKey: pondKey(pondId) })
    void queryClient.invalidateQueries({ queryKey: ['alerts'] })
    void queryClient.invalidateQueries({ queryKey: ['farms'] })
    // Records, alert handling and actuator logs flow into the Daily Report draft
    void queryClient.invalidateQueries({ queryKey: ['report'] })
  }
}

export function usePond(pondId: string) {
  return useQuery({
    queryKey: pondKey(pondId),
    queryFn: async () => unwrap(await api.GET('/ponds/{pondId}', { params: { path: { pondId } } })),
    ...liveQuery,
  })
}

// ── IoT / Water Quality ──

export function useCurrentSensors(pondId: string) {
  return useQuery({
    queryKey: [...pondKey(pondId), 'sensors', 'current'],
    queryFn: async () => unwrap(await api.GET('/ponds/{pondId}/sensors/current', { params: { path: { pondId } } })),
    ...liveQuery,
  })
}

export type SeriesRange = '24h' | '7d' | '30d'
/** Range → window and display interval (5-min readings shown hourly / 6-hourly / daily). */
export const RANGE: Record<SeriesRange, { hours: number; interval: '1h' | '6h' | '1d' }> = {
  '24h': { hours: 24, interval: '1h' },
  '7d': { hours: 24 * 7, interval: '6h' },
  '30d': { hours: 24 * 30, interval: '1d' },
}

export function useSensorSeries(pondId: string, parameter: SensorParameter, range: SeriesRange, now: Date) {
  const to = now.toISOString()
  const from = new Date(now.getTime() - RANGE[range].hours * 3_600_000).toISOString()
  return useQuery({
    queryKey: [...pondKey(pondId), 'sensors', 'series', parameter, range],
    queryFn: async () =>
      unwrap(
        await api.GET('/ponds/{pondId}/sensors/series', {
          params: { path: { pondId }, query: { parameter, from, to, interval: RANGE[range].interval } },
        }),
      ),
    placeholderData: keepPreviousData,
    ...liveQuery,
  })
}

export function useSensorHistory(pondId: string, from: string, to: string, page: number, pageSize: number) {
  return useQuery({
    queryKey: [...pondKey(pondId), 'sensors', 'history', from, page],
    queryFn: async () =>
      unwrap(
        await api.GET('/ponds/{pondId}/sensors/history', {
          params: { path: { pondId }, query: { from, to, page, pageSize } },
        }),
      ),
    placeholderData: keepPreviousData,
  })
}

export function useAnomalies(pondId: string) {
  return useQuery({
    queryKey: [...pondKey(pondId), 'sensors', 'anomalies'],
    queryFn: async () => unwrap(await api.GET('/ponds/{pondId}/sensors/anomalies', { params: { path: { pondId } } })),
    ...liveQuery,
  })
}

// ── Alerts ──

export function usePondAlerts(pondId: string) {
  return useQuery({
    queryKey: ['alerts', { pondId }],
    queryFn: async () => unwrap(await api.GET('/alerts', { params: { query: { pondId, pageSize: 100 } } })),
    ...liveQuery,
  })
}

export function useAlert(alertId: string | null) {
  return useQuery({
    queryKey: ['alerts', 'detail', alertId],
    queryFn: async () => unwrap(await api.GET('/alerts/{alertId}', { params: { path: { alertId: alertId ?? '' } } })),
    enabled: !!alertId,
  })
}

export function useAlertMutations(pondId: string, alertId: string) {
  const invalidate = useInvalidatePond(pondId)
  const path = { params: { path: { alertId } } }
  return {
    acknowledge: useMutation({
      mutationFn: async () => unwrap(await api.POST('/alerts/{alertId}/acknowledge', path)),
      onSuccess: invalidate,
    }),
    recordAction: useMutation({
      mutationFn: async (body: S['AlertActionInput']) => unwrap(await api.POST('/alerts/{alertId}/actions', { ...path, body })),
      onSuccess: invalidate,
    }),
    resolve: useMutation({
      mutationFn: async () => unwrap(await api.POST('/alerts/{alertId}/resolve', { ...path, body: {} })),
      onSuccess: invalidate,
    }),
  }
}

// ── Records ──

export function useFeedings(pondId: string) {
  return useQuery({
    queryKey: [...pondKey(pondId), 'feedings'],
    queryFn: async () =>
      unwrap(await api.GET('/ponds/{pondId}/feedings', { params: { path: { pondId }, query: { pageSize: 20 } } })),
  })
}

export function useSaveFeeding(pondId: string) {
  const invalidate = useInvalidatePond(pondId)
  return useMutation({
    mutationFn: async ({ id, body }: { id?: string; body: S['FeedingInput'] }) =>
      id
        ? unwrap(await api.PATCH('/feedings/{recordId}', { params: { path: { recordId: id } }, body }))
        : unwrap(await api.POST('/ponds/{pondId}/feedings', { params: { path: { pondId } }, body })),
    onSuccess: invalidate,
  })
}

export function useMortalities(pondId: string) {
  return useQuery({
    queryKey: [...pondKey(pondId), 'mortalities'],
    queryFn: async () =>
      unwrap(await api.GET('/ponds/{pondId}/mortalities', { params: { path: { pondId }, query: { pageSize: 20 } } })),
  })
}

export function useSaveMortality(pondId: string) {
  const invalidate = useInvalidatePond(pondId)
  return useMutation({
    mutationFn: async ({ id, body }: { id?: string; body: S['MortalityInput'] }) =>
      id
        ? unwrap(await api.PATCH('/mortalities/{recordId}', { params: { path: { recordId: id } }, body }))
        : unwrap(await api.POST('/ponds/{pondId}/mortalities', { params: { path: { pondId } }, body })),
    onSuccess: invalidate,
  })
}

export function usePondSamplings(pondId: string) {
  return useQuery({
    queryKey: [...pondKey(pondId), 'samplings'],
    queryFn: async () => unwrap(await api.GET('/ponds/{pondId}/samplings', { params: { path: { pondId } } })),
  })
}

export function useSaveSampling(pondId: string) {
  const invalidate = useInvalidatePond(pondId)
  return useMutation({
    mutationFn: async ({ id, body }: { id?: string; body: S['SamplingInput'] }) =>
      id
        ? unwrap(await api.PATCH('/samplings/{recordId}', { params: { path: { recordId: id } }, body }))
        : unwrap(await api.POST('/ponds/{pondId}/samplings', { params: { path: { pondId } }, body })),
    onSuccess: invalidate,
  })
}

// ── Actuators ──

export function useActuators(pondId: string) {
  return useQuery({
    queryKey: [...pondKey(pondId), 'actuators'],
    queryFn: async () => unwrap(await api.GET('/ponds/{pondId}/actuators', { params: { path: { pondId } } })),
    ...liveQuery,
  })
}

export function useActuatorLogs(pondId: string) {
  return useQuery({
    queryKey: [...pondKey(pondId), 'actuator-logs'],
    queryFn: async () =>
      unwrap(await api.GET('/ponds/{pondId}/actuator-logs', { params: { path: { pondId }, query: { pageSize: 20 } } })),
  })
}

export function useActuatorCommand(pondId: string) {
  const invalidate = useInvalidatePond(pondId)
  return useMutation({
    mutationFn: async ({ actuatorId, command }: { actuatorId: string; command: S['ActuatorCommand'] }) =>
      unwrap(await api.POST('/actuators/{actuatorId}/commands', { params: { path: { actuatorId } }, body: { command } })),
    // A blocked command is logged too, so refresh in both cases.
    onSettled: invalidate,
  })
}
