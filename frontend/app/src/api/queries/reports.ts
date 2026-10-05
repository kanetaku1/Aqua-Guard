import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, unwrap } from '../client'
import type { components } from '../schema'

type S = components['schemas']

/** Report list (TM-04 / TM-05 History, FM-04). */
export function useReports(type: S['ReportType'], farmId?: string) {
  return useQuery({
    queryKey: ['reports', type, { farmId }],
    queryFn: async () => unwrap(await api.GET('/reports', { params: { query: { type, farmId, pageSize: 50 } } })),
  })
}

export function useDailyReport(reportId: string | null) {
  return useQuery({
    queryKey: ['report', reportId],
    queryFn: async () => unwrap(await api.GET('/reports/daily/{reportId}', { params: { path: { reportId: reportId ?? '' } } })),
    enabled: !!reportId,
    // The draft is rebuilt from records on the server; keep the editor stable while typing
    refetchOnWindowFocus: false,
  })
}

function useInvalidateReports() {
  const queryClient = useQueryClient()
  return () => {
    void queryClient.invalidateQueries({ queryKey: ['reports'] })
    void queryClient.invalidateQueries({ queryKey: ['report'] })
    void queryClient.invalidateQueries({ queryKey: ['farms'] })
  }
}

export function useCreateDailyReport() {
  const invalidate = useInvalidateReports()
  return useMutation({
    mutationFn: async (body: { farmId: string; date: string }) => unwrap(await api.POST('/reports/daily', { body })),
    onSuccess: invalidate,
  })
}

export function useSaveDailyReport(reportId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: S['DailyReportInput']) =>
      unwrap(await api.PATCH('/reports/daily/{reportId}', { params: { path: { reportId } }, body })),
    onSuccess: (report) => {
      queryClient.setQueryData(['report', reportId], report)
      void queryClient.invalidateQueries({ queryKey: ['reports'] })
      void queryClient.invalidateQueries({ queryKey: ['farms'] })
    },
  })
}

export function useSubmitReport(reportId: string) {
  const invalidate = useInvalidateReports()
  return useMutation({
    mutationFn: async () => unwrap(await api.POST('/reports/{reportId}/submit', { params: { path: { reportId } } })),
    onSuccess: invalidate,
  })
}

export function useWeeklyReport(reportId: string | null) {
  return useQuery({
    queryKey: ['report', reportId],
    queryFn: async () => unwrap(await api.GET('/reports/weekly/{reportId}', { params: { path: { reportId: reportId ?? '' } } })),
    enabled: !!reportId,
    refetchOnWindowFocus: false,
  })
}

export function useSaveWeeklyReport(reportId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: S['WeeklyReportInput']) =>
      unwrap(await api.PATCH('/reports/weekly/{reportId}', { params: { path: { reportId } }, body })),
    onSuccess: (report) => {
      queryClient.setQueryData(['report', reportId], report)
      void queryClient.invalidateQueries({ queryKey: ['reports'] })
      void queryClient.invalidateQueries({ queryKey: ['farms'] })
    },
  })
}
