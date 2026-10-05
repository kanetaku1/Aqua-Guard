import { useQuery } from '@tanstack/react-query'
import { api, unwrap } from '../client'
import { liveQuery } from '../refresh'
import type { Severity } from '../types'

export function useFarm(farmId: string) {
  return useQuery({
    queryKey: ['farms', farmId],
    queryFn: async () => unwrap(await api.GET('/farms/{farmId}', { params: { path: { farmId } } })),
    ...liveQuery,
  })
}

/** TM-01 Pond Status: current water quality per Pond. */
export function usePondWaterQuality(farmId: string) {
  return useQuery({
    queryKey: ['farms', farmId, 'ponds', 'water-quality'],
    queryFn: async () =>
      unwrap(await api.GET('/farms/{farmId}/ponds/water-quality', { params: { path: { farmId } } })),
    ...liveQuery,
  })
}

export function useOperationalStatus(farmId: string) {
  return useQuery({
    queryKey: ['farms', farmId, 'operational-status'],
    queryFn: async () =>
      unwrap(await api.GET('/farms/{farmId}/operational-status', { params: { path: { farmId } } })),
    ...liveQuery,
  })
}

export function useReportStatus(farmId: string) {
  return useQuery({
    queryKey: ['farms', farmId, 'report-status'],
    queryFn: async () => unwrap(await api.GET('/farms/{farmId}/report-status', { params: { path: { farmId } } })),
  })
}

export type FarmFilters = { q?: string; status?: Severity; location?: string; hasIssues?: boolean }

/** FM-01 / FM-02: Farms of the Company with their status and the facts behind it. */
export function useFarms(filters: FarmFilters = {}) {
  return useQuery({
    queryKey: ['farms', 'list', filters],
    queryFn: async () =>
      unwrap(
        await api.GET('/farms', {
          params: {
            query: {
              q: filters.q || undefined,
              status: filters.status,
              location: filters.location || undefined,
              hasIssues: filters.hasIssues,
            },
          },
        }),
      ),
    ...liveQuery,
  })
}

/** Risk / Issue — live from alerts (FM-01 all Farms, FM-03 one Farm). */
export function useIssues(farmId?: string) {
  return useQuery({
    queryKey: ['issues', { farmId }],
    queryFn: async () => unwrap(await api.GET('/issues', { params: { query: { farmId, pageSize: 100 } } })),
    ...liveQuery,
  })
}

/** FM-01 Production Status: Company totals only (no averaged ABW, 04 §4). */
export function useCompanyProduction() {
  return useQuery({
    queryKey: ['production', 'company'],
    queryFn: async () => unwrap(await api.GET('/production/summary')),
  })
}

/** FM-03 Status Trend: the Farm status for each of the last `days` days. */
export function useStatusTrend(farmId: string, days = 14) {
  return useQuery({
    queryKey: ['farms', farmId, 'status-trend', days],
    queryFn: async () =>
      unwrap(await api.GET('/farms/{farmId}/status-trend', { params: { path: { farmId }, query: { days } } })),
  })
}

/** FM-03 Production Status: Farm KPIs (weighted), Pond Production Summary and the target curve. */
export function useFarmProduction(farmId: string) {
  return useQuery({
    queryKey: ['farms', farmId, 'production'],
    queryFn: async () => unwrap(await api.GET('/farms/{farmId}/production', { params: { path: { farmId } } })),
  })
}

/** FM-03 Alert Drawer (read-only). */
export function useIssue(issueId: string | null) {
  return useQuery({
    queryKey: ['issues', 'detail', issueId],
    queryFn: async () => unwrap(await api.GET('/issues/{issueId}', { params: { path: { issueId: issueId ?? '' } } })),
    enabled: !!issueId,
  })
}
