import { HttpResponse, http } from 'msw'
import type { components } from '@/api/schema'
import { api, currentUser, problem } from '../http'
import { createReport, getReport, listReports, missingFields, saveReport, submitReport } from '../reports'
import { getWeekly, listWeekly, saveWeekly, submitWeekly } from '../weeklyReports'

/** Daily / Weekly Reports. FM sees submitted reports only; TM sees and edits the assigned Farm (02 §5). */

type S = components['schemas']

function caller() {
  const user = currentUser()
  if (!user) return { denied: problem(401, 'unauthenticated', 'Not signed in') }
  if (user.role === 'system_administrator') return { denied: problem(403, 'forbidden', 'Not allowed for this role') }
  return { user }
}

const toListItem = (r: S['DailyReport'] | S['WeeklyReport']): S['ReportListItem'] => {
  const { id, type, farm, date, weekStart, weekEnd, technicalManager, status, issueCount, submittedAt, dueAt, savedAt } = r
  const { pondsNeedingAttention, feedKg, mortalityPcs, biomassKg, survivalRatePct, pondsBehind } = r
  return { id, type, farm, date, weekStart, weekEnd, technicalManager, status, issueCount, submittedAt, dueAt, savedAt, pondsNeedingAttention, feedKg, mortalityPcs, biomassKg, survivalRatePct, pondsBehind }
}

export const reportHandlers = [
  http.get(api('/reports'), ({ request }) => {
    const { user, denied } = caller()
    if (denied) return denied
    const url = new URL(request.url)
    const status = url.searchParams.get('status')
    const source: (S['DailyReport'] | S['WeeklyReport'])[] = url.searchParams.get('type') === 'weekly' ? listWeekly() : listReports()
    const farmId = url.searchParams.get('farmId')
    const items = source
      .filter((r) => (user.role === 'technical_manager' ? r.farm.id === user.farm?.id : r.status === 'submitted'))
      .filter((r) => !farmId || r.farm.id === farmId)
      .filter((r) => !status || r.status === status)
      .map(toListItem)
    return HttpResponse.json({ items, page: 1, pageSize: items.length, total: items.length })
  }),

  http.post(api('/reports/daily'), async ({ request }) => {
    const { user, denied } = caller()
    if (denied) return denied
    if (user.role !== 'technical_manager') return problem(403, 'forbidden', 'Only Technical Managers create reports')
    const { date } = (await request.json()) as { farmId: string; date: string }
    const result = createReport(date)
    if ('conflict' in result) return problem(409, 'report_exists', 'A report for this date already exists', { existingReportId: result.conflict })
    return HttpResponse.json(result, { status: 201 })
  }),

  http.get(api('/reports/daily/:reportId'), ({ params }) => {
    const { user, denied } = caller()
    if (denied) return denied
    const report = getReport(params.reportId as string)
    if (!report || (user.role === 'farms_manager' && report.status !== 'submitted') || (user.role === 'technical_manager' && report.farm.id !== user.farm?.id)) {
      return problem(404, 'not_found', 'Report not found')
    }
    // Previous / next only point to reports the caller can open (FM: submitted only)
    const visible = (id: string | null) => (id && (user.role !== 'farms_manager' || getReport(id)?.status === 'submitted') ? id : null)
    const previousReportId = visible(report.previousReportId)
    const nextReportId = visible(report.nextReportId)
    return HttpResponse.json({
      ...report,
      previousReportId,
      nextReportId,
      previousReportDate: previousReportId ? (getReport(previousReportId)?.date ?? null) : null,
      nextReportDate: nextReportId ? (getReport(nextReportId)?.date ?? null) : null,
    })
  }),

  http.patch(api('/reports/daily/:reportId'), async ({ params, request }) => {
    const { user, denied } = caller()
    if (denied) return denied
    if (user.role !== 'technical_manager') return problem(403, 'forbidden', 'Only Technical Managers edit reports')
    const result = saveReport(params.reportId as string, (await request.json()) as S['DailyReportInput'])
    if (result === null) return problem(404, 'not_found', 'Report not found')
    if (result === 'submitted') return problem(409, 'report_submitted', 'Submitted reports can no longer be edited')
    return HttpResponse.json(result)
  }),

  http.post(api('/reports/weekly'), async () => {
    const { user, denied } = caller()
    if (denied) return denied
    if (user.role !== 'technical_manager') return problem(403, 'forbidden', 'Only Technical Managers create reports')
    // The mock only has the current week, which already exists
    return problem(409, 'report_exists', 'A report for this week already exists', { existingReportId: 'weekly-farm-a-2026-09-22' })
  }),

  http.get(api('/reports/weekly/:reportId'), ({ params }) => {
    const { user, denied } = caller()
    if (denied) return denied
    const report = getWeekly(params.reportId as string)
    if (!report || (user.role === 'farms_manager' && report.status !== 'submitted') || (user.role === 'technical_manager' && report.farm.id !== user.farm?.id)) {
      return problem(404, 'not_found', 'Report not found')
    }
    return HttpResponse.json(report)
  }),

  http.patch(api('/reports/weekly/:reportId'), async ({ params, request }) => {
    const { user, denied } = caller()
    if (denied) return denied
    if (user.role !== 'technical_manager') return problem(403, 'forbidden', 'Only Technical Managers edit reports')
    const result = saveWeekly(params.reportId as string, (await request.json()) as S['WeeklyReportInput'])
    if (result === null) return problem(404, 'not_found', 'Report not found')
    if (result === 'submitted') return problem(409, 'report_submitted', 'Submitted reports can no longer be edited')
    return HttpResponse.json(result)
  }),

  http.post(api('/reports/:reportId/submit'), ({ params }) => {
    const { user, denied } = caller()
    if (denied) return denied
    if (user.role !== 'technical_manager') return problem(403, 'forbidden', 'Only Technical Managers submit reports')
    const id = params.reportId as string
    if (id.startsWith('weekly-')) {
      const result = submitWeekly(id)
      if (result === null) return problem(404, 'not_found', 'Report not found')
      if (result === 'submitted') return problem(409, 'report_submitted', 'Already submitted')
      if (result === 'missing') {
        return problem(422, 'missing_required', 'Required fields are missing', { fieldErrors: [{ field: 'technicalSummary', message: 'Required before submitting' }] })
      }
      return HttpResponse.json(toListItem(result))
    }
    if (!getReport(id)) return problem(404, 'not_found', 'Report not found')
    const missing = missingFields(id)
    if (missing.length) {
      return problem(422, 'missing_required', 'Required fields are missing', {
        fieldErrors: missing.map((field) => ({ field, message: 'Required before submitting' })),
      })
    }
    const result = submitReport(id)
    if (result === 'submitted') return problem(409, 'report_submitted', 'Already submitted')
    return HttpResponse.json(toListItem(result!))
  }),
]
