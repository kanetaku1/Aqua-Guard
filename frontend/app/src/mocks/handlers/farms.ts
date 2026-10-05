import { HttpResponse, http } from 'msw'
import type { SeverityCounts } from '@/api/types'
import {
  farmAAlerts,
  farmAOperationalStatus,
  farmAReportStatus,
  farmAWaterQuality,
  normalRanges,
  syncStatus,
} from '../data'
import { api, currentUser, denyFarmAccess, problem } from '../http'
import { dailyStatusToday, lastSubmittedDaily } from '../reports'
import { weeklyStatus } from '../weeklyReports'
import { companyProduction, farmDetail, farms, generatedProduction, issueDetail, issues, sortIssues, statusTrend } from '../company'
import { farmAProduction } from '../weeklyReports'

const counts = (statuses: string[]): SeverityCounts => ({
  normal: statuses.filter((s) => s === 'normal').length,
  attention: statuses.filter((s) => s === 'attention').length,
  warning: statuses.filter((s) => s === 'warning').length,
  critical: statuses.filter((s) => s === 'critical').length,
})

export const farmHandlers = [
  http.get(api('/sync-status'), () => {
    const user = currentUser()
    if (!user) return problem(401, 'unauthenticated', 'Not signed in')
    if (user.role === 'system_administrator') return problem(403, 'forbidden', 'Not allowed for this role')
    return HttpResponse.json(syncStatus)
  }),

  // FM: every Farm of the Company · TM: the assigned Farm only (02 §5)
  http.get(api('/farms'), ({ request }) => {
    const user = currentUser()
    if (!user) return problem(401, 'unauthenticated', 'Not signed in')
    if (user.role === 'system_administrator') return problem(403, 'forbidden', 'Not allowed for this role')
    const url = new URL(request.url)
    const q = url.searchParams.get('q')?.toLowerCase()
    const status = url.searchParams.get('status')
    const location = url.searchParams.get('location')
    const hasIssues = url.searchParams.get('hasIssues')
    const scope = user.role === 'technical_manager' ? farms.filter((f) => f.id === user.farm?.id) : farms
    const items = scope
      .filter((f) => !q || f.name.toLowerCase().includes(q))
      .filter((f) => !status || f.status === status)
      .filter((f) => !location || f.location === location)
      .filter((f) => hasIssues === null || (hasIssues === 'true') === f.openIssues > 0)
    return HttpResponse.json({ items, counts: counts(scope.map((f) => f.status)) })
  }),

  http.get(api('/issues'), ({ request }) => {
    const user = currentUser()
    if (!user) return problem(401, 'unauthenticated', 'Not signed in')
    if (user.role === 'system_administrator') return problem(403, 'forbidden', 'Not allowed for this role')
    const url = new URL(request.url)
    const farmId = url.searchParams.get('farmId')
    const state = url.searchParams.get('state') ?? 'ongoing'
    const items = sortIssues(issues)
      .filter((i) => user.role !== 'technical_manager' || i.farm.id === user.farm?.id)
      .filter((i) => !farmId || i.farm.id === farmId)
      .filter((i) => i.state === state)
    return HttpResponse.json({ items, page: 1, pageSize: items.length, total: items.length })
  }),

  http.get(api('/production/summary'), () => {
    const user = currentUser()
    if (!user) return problem(401, 'unauthenticated', 'Not signed in')
    if (user.role !== 'farms_manager') return problem(403, 'forbidden', 'Not allowed for this role')
    return HttpResponse.json(companyProduction)
  }),

  http.get(api('/farms/:farmId'), ({ params }) => {
    const farmId = params.farmId as string
    const denied = denyFarmAccess(farmId, ['farms_manager', 'technical_manager'])
    if (denied) return denied
    const farm = farmDetail(farmId)
    return farm ? HttpResponse.json(farm) : problem(404, 'not_found', 'Farm not found')
  }),

  http.get(api('/farms/:farmId/status-trend'), ({ params, request }) => {
    const farmId = params.farmId as string
    const denied = denyFarmAccess(farmId, ['farms_manager', 'technical_manager'])
    if (denied) return denied
    const items = statusTrend(farmId, Number(new URL(request.url).searchParams.get('days') ?? 14))
    return items ? HttpResponse.json({ items }) : problem(404, 'not_found', 'Farm not found')
  }),

  http.get(api('/farms/:farmId/production'), ({ params }) => {
    const farmId = params.farmId as string
    const denied = denyFarmAccess(farmId, ['farms_manager', 'technical_manager'])
    if (denied) return denied
    const production = farmId === 'farm-a' ? farmAProduction() : generatedProduction(farmId)
    return production ? HttpResponse.json(production) : problem(404, 'not_found', 'Farm not found')
  }),

  http.get(api('/issues/:issueId'), ({ params }) => {
    const user = currentUser()
    if (!user) return problem(401, 'unauthenticated', 'Not signed in')
    const detail = issueDetail(params.issueId as string)
    if (!detail || user.role === 'system_administrator' || (user.role === 'technical_manager' && detail.farm.id !== user.farm?.id)) {
      return problem(404, 'not_found', 'Issue not found')
    }
    return HttpResponse.json(detail)
  }),

  http.get(api('/farms/:farmId/ponds/water-quality'), ({ params }) => {
    const denied = denyFarmAccess(params.farmId as string, ['technical_manager'])
    if (denied) return denied
    return HttpResponse.json({
      items: farmAWaterQuality,
      counts: counts(farmAWaterQuality.map((r) => r.status)),
      normalRanges,
    })
  }),

  http.get(api('/farms/:farmId/operational-status'), ({ params }) => {
    const denied = denyFarmAccess(params.farmId as string, ['technical_manager'])
    return denied ?? HttpResponse.json(farmAOperationalStatus)
  }),

  http.get(api('/farms/:farmId/report-status'), ({ params }) => {
    const denied = denyFarmAccess(params.farmId as string, ['technical_manager'])
    // From the live report stores (TM-04 / TM-05)
    return denied ?? HttpResponse.json({ ...farmAReportStatus, dailyToday: dailyStatusToday('2026-09-29'), weeklyThisWeek: weeklyStatus('2026-09-22'), lastSubmitted: lastSubmittedDaily() })
  }),

  http.get(api('/alerts'), ({ request }) => {
    const url = new URL(request.url)
    const farmId = url.searchParams.get('farmId') ?? 'farm-a'
    const denied = denyFarmAccess(farmId, ['technical_manager'])
    if (denied) return denied
    const states = (url.searchParams.get('state') ?? '').split(',').filter(Boolean)
    const pondId = url.searchParams.get('pondId')
    const items = farmAAlerts.filter(
      (a) =>
        (!pondId || a.pond.id === pondId) &&
        (states.length === 0 || states.includes(a.state) || (states.includes('open') && a.state !== 'resolved')),
    )
    return HttpResponse.json({ items, page: 1, pageSize: items.length, total: items.length })
  }),
]
