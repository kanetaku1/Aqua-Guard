import { Clock, Warehouse } from 'lucide-react'
import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useSearchParams } from 'react-router'
import { useCurrentUser } from '@/api/queries/auth'
import { useFarm, useReportStatus } from '@/api/queries/farms'
import { useReports, useWeeklyReport } from '@/api/queries/reports'
import { Tabs } from '@/components/Controls'
import { Icon } from '@/components/Icon'
import { Card, PageHeader } from '@/components/Page'
import { QueryState } from '@/components/QueryState'
import { ReportStateText } from '@/components/StatusMark'
import { Toast } from '@/components/Toast'
import { useDocumentTitle } from '@/components/useDocumentTitle'
import { formatDayTime, formatDue, formatNumber, formatPeriod, formatRecentTime } from '@/lib/format'
import { WeeklyEditor } from './WeeklyEditor'

/**
 * TM-05 Weekly Report (05 §5, 06 TM-05): this week's report by default, or `?id=` from History.
 * Inner Pond tabs live in `?pw=`.
 */
export function TmWeeklyReport() {
  useDocumentTitle('TM-05 Weekly Report')
  const { t } = useTranslation()
  const me = useCurrentUser()
  const farmId = me.farm?.id ?? ''
  const [params] = useSearchParams()
  const tab = params.get('tab') === 'history' ? 'history' : 'create'
  const farm = useFarm(farmId)
  const status = useReportStatus(farmId)
  const reportId = params.get('id') ?? status.data?.weeklyThisWeek.reportId ?? null
  const report = useWeeklyReport(reportId)
  const [toast, setToast] = useState<{ message: string; detail?: string } | null>(null)
  const clearToast = useCallback(() => setToast(null), [])
  const r = report.data

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: t('nav.reports') }, { label: t('nav.weeklyReport') }]}
        title={
          <>
            {t('weekly.title', { period: r ? formatPeriod(r.weekStart!, r.weekEnd!) : '' })} {r && <ReportStateText state={r.status} size="lg" />}
          </>
        }
        meta={
          r && (
            <>
              <span>
                <Icon icon={Warehouse} />
                {t('weekly.meta', { farm: r.farm.name, count: farm.data?.pondCount ?? r.pondsThisWeek.length, min: r.docRange.min, max: r.docRange.max })}
              </span>
              <span>
                <Icon icon={Clock} />
                {r.status === 'submitted' && r.submittedAt
                  ? t('daily.submittedAt', { time: formatDayTime(r.submittedAt) })
                  : t('weekly.savedDue', { saved: r.savedAt ? formatRecentTime(r.savedAt) : '—', due: formatDue(r.dueAt) })}
              </span>
            </>
          )
        }
      />

      <Tabs
        active={tab}
        tabs={[
          { key: 'create', label: t('daily.tabs.create') },
          { key: 'history', label: t('daily.tabs.history') },
        ]}
      />

      {tab === 'history' ? (
        <WeeklyHistory farmId={farmId} />
      ) : reportId ? (
        <QueryState query={report}>{(data) => <WeeklyEditor key={data.id} report={data} onToast={(message, detail) => setToast({ message, detail })} />}</QueryState>
      ) : (
        status.data && (
          <section className="card">
            <div className="empty">
              <span className="empty-title">{t('weekly.notStarted')}</span>
            </div>
          </section>
        )
      )}

      {toast && <Toast message={toast.message} detail={toast.detail} onDone={clearToast} />}
    </>
  )
}

function WeeklyHistory({ farmId }: { farmId: string }) {
  const { t } = useTranslation()
  const reports = useReports('weekly', farmId)
  return (
    <Card title={t('weekly.history.title')}>
      <QueryState query={reports}>
        {(data) => (
          <table className="table">
            <thead>
              <tr>
                <th>{t('weekly.history.period')}</th>
                <th>{t('daily.history.status')}</th>
                <th className="num">{t('weekly.kpi.biomass')}</th>
                <th className="num">{t('weekly.kpi.sr')}</th>
                <th className="num">{t('weekly.history.behind')}</th>
                <th>{t('daily.history.submitted')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data.items.map((r) => (
                <tr key={r.id}>
                  <td className="cell-main">{r.weekStart && r.weekEnd ? formatPeriod(r.weekStart, r.weekEnd) : '—'}</td>
                  <td>
                    <ReportStateText state={r.status} />
                  </td>
                  <td className="num">{r.biomassKg == null ? '—' : `${formatNumber(r.biomassKg / 1000, 1)} t`}</td>
                  <td className="num">{r.survivalRatePct == null ? '—' : `${formatNumber(r.survivalRatePct)}%`}</td>
                  <td className="num">{r.pondsBehind ?? '—'}</td>
                  <td className="text-muted">{r.submittedAt ? formatDayTime(r.submittedAt) : '—'}</td>
                  <td className="actions">
                    {r.status === 'draft' ? (
                      <Link className="btn btn--outline btn--sm" to={`?tab=create&id=${r.id}`}>
                        {t('tmDashboard.continue')}
                      </Link>
                    ) : (
                      <Link className="btn btn--link" to={`?tab=create&id=${r.id}`}>
                        {t('common.view')}
                      </Link>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </QueryState>
    </Card>
  )
}
