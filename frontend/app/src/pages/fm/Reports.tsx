import { Search } from 'lucide-react'
import { parseISO, subDays } from 'date-fns'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useSearchParams } from 'react-router'
import { useFarms } from '@/api/queries/farms'
import { useReports } from '@/api/queries/reports'
import type { ReportListItem } from '@/api/types'
import { Pagination, Segmented, Tabs } from '@/components/Controls'
import { Icon } from '@/components/Icon'
import { PageHeader } from '@/components/Page'
import { QueryState } from '@/components/QueryState'
import { ReportStateText } from '@/components/StatusMark'
import { useDocumentTitle } from '@/components/useDocumentTitle'
import { formatCalendarDate, formatDayTime, formatPeriod, todayInWib } from '@/lib/format'

const PAGE_SIZE = 8
type Type = 'daily' | 'weekly'
/** Period switch at the right of the filter bar (wireframe). The first key is the default. */
const RANGES: Record<Type, { key: string; days: number }[]> = {
  daily: [
    { key: '7d', days: 7 },
    { key: '24h', days: 1 },
    { key: '30d', days: 30 },
  ],
  weekly: [
    { key: '4w', days: 28 },
    { key: '3m', days: 91 },
    { key: '1y', days: 365 },
  ],
}
const ORDER: Record<Type, string[]> = { daily: ['24h', '7d', '30d'], weekly: ['4w', '3m', '1y'] }

/**
 * FM-04 Report List (05 §4 / 06 FM-04 / prototype screens/fm-reports.html): find submitted Daily / Weekly Reports.
 * Read only — the Farms Manager only sees submitted reports (02 §5.1). Tab and filters live in the URL.
 */
export function FmReports() {
  useDocumentTitle('FM-04 Reports')
  const { t } = useTranslation()
  const [params, setParams] = useSearchParams()
  const type: Type = params.get('type') === 'weekly' ? 'weekly' : 'daily'
  const q = params.get('q') ?? ''
  const farmId = params.get('farm') ?? ''
  const range = RANGES[type].some((r) => r.key === params.get('range')) ? params.get('range')! : RANGES[type][0].key
  const reports = useReports(type)
  const farms = useFarms()
  const [page, setPage] = useState(1)

  const setParam = (key: string, value: string) => {
    setPage(1)
    setParams(
      (p) => {
        if (value) p.set(key, value)
        else p.delete(key)
        return p
      },
      { replace: true },
    )
  }

  const filter = (items: ReportListItem[]) => {
    const needle = q.trim().toLowerCase()
    const days = RANGES[type].find((r) => r.key === range)?.days ?? 7
    const from = subDays(parseISO(todayInWib()), days)
    return items
      .filter((r) => r.status === 'submitted')
      .filter((r) => !farmId || r.farm.id === farmId)
      .filter((r) => !needle || `${r.farm.name} ${r.technicalManager.name}`.toLowerCase().includes(needle))
      .filter((r) => parseISO((type === 'daily' ? r.date : r.weekEnd) ?? '') >= from)
  }

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: t('nav.dashboard'), to: '/fm/dashboard' }, { label: t('nav.reports') }]}
        title={t('fm.reports.title')}
        meta={<span>{t('fm.reports.meta')}</span>}
      />
      <section className="card">
        <Tabs
          param="type"
          active={type}
          tabs={[
            { key: 'daily', label: t('nav.dailyReports') },
            { key: 'weekly', label: t('nav.weeklyReports') },
          ]}
        />
        <div className="card-body" style={{ paddingBottom: 16 }}>
          <div className="filter-bar">
            <div className="input-search">
              <Icon icon={Search} />
              <input className="input" placeholder={t('fm.reports.search')} aria-label={t('fm.reports.search')} value={q} onChange={(e) => setParam('q', e.target.value)} />
            </div>
            <select className="select" aria-label={t('fm.col.farm')} value={farmId} onChange={(e) => setParam('farm', e.target.value)}>
              <option value="">{t('fm.reports.farmAll')}</option>
              {farms.data?.items.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
            <select className="select" aria-label={t('fm.col.status')} value="submitted" disabled>
              <option value="submitted">{t('fm.reports.statusSubmitted')}</option>
            </select>
            <div style={{ marginLeft: 'auto' }}>
              <Segmented
                label={t('fm.reports.range')}
                value={range}
                options={ORDER[type].map((key) => ({ key, label: t(`fm.reports.ranges.${key}`) }))}
                onChange={(key) => setParam('range', key === RANGES[type][0].key ? '' : key)}
              />
            </div>
          </div>
        </div>
        <QueryState query={reports}>
          {(data) => {
            const rows = filter(data.items)
            const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))
            const current = Math.min(page, pageCount)
            const shown = rows.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE)
            return (
              <>
                <table className="table">
                  <thead>
                    <tr>
                      <th>{type === 'daily' ? t('records.date') : t('weekly.history.period')}</th>
                      <th>{t('fm.col.farm')}</th>
                      <th>{t('role.technical_manager')}</th>
                      <th>{t('fm.col.status')}</th>
                      <th className="num">{type === 'daily' ? t('fm.col.issues') : t('fm.reports.majorIssues')}</th>
                      <th>{t('daily.history.submitted')}</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map((r) => (
                      <tr key={r.id}>
                        <td className="cell-main">{type === 'daily' ? formatCalendarDate(r.date!, 'd MMM yyyy') : formatPeriod(r.weekStart!, r.weekEnd!)}</td>
                        <td>{r.farm.name}</td>
                        <td>{r.technicalManager.name}</td>
                        <td>
                          <ReportStateText state={r.status} />
                        </td>
                        <td className="num">{r.issueCount ?? 0}</td>
                        <td className="text-muted">{r.submittedAt ? formatDayTime(r.submittedAt) : '—'}</td>
                        <td className="actions">
                          <Link className="btn btn--link btn--sm" to={`/fm/reports/${type}/${r.id}`}>
                            {t('common.view')}
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {rows.length === 0 ? (
                  <div className="empty">
                    <span className="empty-title">{t('fm.reports.none')}</span>
                  </div>
                ) : (
                  <div className="card-footer" style={{ justifyContent: 'space-between' }}>
                    <span className="caption" style={{ alignSelf: 'center' }}>
                      {t('fm.reports.showing', { from: (current - 1) * PAGE_SIZE + 1, to: (current - 1) * PAGE_SIZE + shown.length, total: rows.length })}
                    </span>
                    <Pagination page={current} pageCount={pageCount} onChange={setPage} />
                  </div>
                )}
              </>
            )
          }}
        </QueryState>
      </section>
    </>
  )
}
