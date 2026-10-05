import { Clock, FilePlus, Warehouse } from 'lucide-react'
import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useSearchParams } from 'react-router'
import { useCurrentUser } from '@/api/queries/auth'
import { useFarm, useReportStatus } from '@/api/queries/farms'
import { useCreateDailyReport, useDailyReport, useReports } from '@/api/queries/reports'
import { Tabs } from '@/components/Controls'
import { Icon } from '@/components/Icon'
import { Card, PageHeader } from '@/components/Page'
import { QueryState } from '@/components/QueryState'
import { ReportStateText } from '@/components/StatusMark'
import { Toast } from '@/components/Toast'
import { useDocumentTitle } from '@/components/useDocumentTitle'
import { formatCalendarDate, formatDayTime, formatNumber, formatRecentTime, formatTime, todayInWib } from '@/lib/format'
import { DailyEditor } from './DailyEditor'

type TabKey = 'create' | 'history'

/**
 * TM-04 Daily Report (05 §5, 06 TM-04): today's report by default, or `?id=` from History.
 * `?tab=history` lists past reports; `?pond=` opens the Pond editor.
 */
export function TmDailyReport() {
  useDocumentTitle('TM-04 Daily Report')
  const { t } = useTranslation()
  const me = useCurrentUser()
  const farmId = me.farm?.id ?? ''
  const [params] = useSearchParams()
  const tab: TabKey = params.get('tab') === 'history' ? 'history' : 'create'
  const farm = useFarm(farmId)
  const status = useReportStatus(farmId)
  const reportId = params.get('id') ?? status.data?.dailyToday.reportId ?? null
  const report = useDailyReport(reportId)
  const create = useCreateDailyReport()
  const [toast, setToast] = useState<{ message: string; detail?: string } | null>(null)
  const clearToast = useCallback(() => setToast(null), [])

  const r = report.data
  const date = r?.date ?? status.data?.dailyToday.date ?? todayInWib()

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: t('nav.reports') }, { label: t('nav.dailyReport') }]}
        title={
          <>
            {t('daily.title', { date: formatCalendarDate(date, 'd MMM yyyy') })}{' '}
            {r ? <ReportStateText state={r.status} size="lg" /> : status.data && <ReportStateText state={status.data.dailyToday.state} size="lg" />}
          </>
        }
        meta={
          <>
            {farm.data && (
              <span>
                <Icon icon={Warehouse} />
                {t('daily.meta', { farm: farm.data.name, count: farm.data.pondCount })}
              </span>
            )}
            {r && (
              <span>
                <Icon icon={Clock} />
                {r.status === 'submitted' && r.submittedAt
                  ? t('daily.submittedAt', { time: formatDayTime(r.submittedAt) })
                  : t('daily.savedDue', { saved: r.savedAt ? formatRecentTime(r.savedAt) : '—', due: formatTime(r.dueAt) })}
              </span>
            )}
          </>
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
        <DailyHistory farmId={farmId} />
      ) : reportId ? (
        <QueryState query={report}>{(data) => <DailyEditor key={data.id} report={data} onToast={(message, detail) => setToast({ message, detail })} />}</QueryState>
      ) : (
        status.data && (
          <section className="card">
            <div className="empty">
              <FilePlus strokeWidth={1.75} aria-hidden="true" />
              <span className="empty-title">{t('daily.notStarted', { date: formatCalendarDate(date) })}</span>
              <span>{t('daily.notStartedHelp')}</span>
              <button type="button" className="btn btn--primary" disabled={create.isPending} onClick={() => create.mutate({ farmId, date })}>
                {t('daily.create')}
              </button>
            </div>
          </section>
        )
      )}

      {toast && <Toast message={toast.message} detail={toast.detail} onDone={clearToast} />}
    </>
  )
}

function DailyHistory({ farmId }: { farmId: string }) {
  const { t } = useTranslation()
  const reports = useReports('daily', farmId)
  return (
    <Card title={t('daily.history.title')}>
      <QueryState query={reports}>
        {(data) => (
          <table className="table">
            <thead>
              <tr>
                <th>{t('records.date')}</th>
                <th>{t('daily.history.status')}</th>
                <th className="num">{t('daily.history.attention')}</th>
                <th className="num">{t('daily.history.feed')}</th>
                <th className="num">{t('daily.ponds.mortality')}</th>
                <th>{t('daily.history.submitted')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data.items.map((r) => (
                <tr key={r.id}>
                  <td className="cell-main">{r.date ? formatCalendarDate(r.date, 'd MMM yyyy') : '—'}</td>
                  <td>
                    <ReportStateText state={r.status} />
                  </td>
                  <td className="num">{r.pondsNeedingAttention ?? '—'}</td>
                  <td className="num">{r.feedKg == null ? '—' : `${formatNumber(r.feedKg)} kg`}</td>
                  <td className="num">{r.mortalityPcs == null ? '—' : `${formatNumber(r.mortalityPcs)} pcs`}</td>
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
