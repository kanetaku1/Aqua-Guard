import { CalendarRange, Send, User } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router'
import { isApiError } from '@/api/client'
import { useWeeklyReport } from '@/api/queries/reports'
import { Icon } from '@/components/Icon'
import { PageHeader } from '@/components/Page'
import { QueryState } from '@/components/QueryState'
import { ReportStateText } from '@/components/StatusMark'
import { useDocumentTitle } from '@/components/useDocumentTitle'
import { formatDayTime, formatPeriod } from '@/lib/format'
import { WeeklyEditor } from '@/pages/tm/reports/WeeklyEditor'

/**
 * FM-06 Weekly Report Detail (05 §4 / 06 FM-06 / prototype screens/fm-weekly-report.html): how the Farm moved in a week.
 * Same sections as TM-05 (what the TM submitted = what the FM reads), rendered read-only.
 */
export function FmWeeklyReport() {
  useDocumentTitle('FM-06 Weekly Report Detail')
  const { t } = useTranslation()
  const { reportId = '' } = useParams()
  const report = useWeeklyReport(reportId)

  if (isApiError(report.error, 404)) {
    return (
      <section className="card">
        <div className="empty">
          <span className="empty-title">{t('fm.reports.notFound')}</span>
          <Link className="btn btn--link" to="/fm/reports?type=weekly">
            {t('fm.reports.back')}
          </Link>
        </div>
      </section>
    )
  }

  return (
    <QueryState query={report}>
      {(r) => {
        const period = formatPeriod(r.weekStart!, r.weekEnd!)
        return (
          <>
            <PageHeader
              breadcrumb={[
                { label: t('nav.reports'), to: '/fm/reports' },
                { label: t('nav.weeklyReports'), to: '/fm/reports?type=weekly' },
                { label: `${r.farm.name} · ${period}` },
              ]}
              title={
                <>
                  {t('fm.weekly.title', { farm: r.farm.name })} <ReportStateText state={r.status} size="lg" />
                </>
              }
              meta={
                <>
                  <span>
                    <Icon icon={CalendarRange} />
                    {t('fm.weekly.period', { period, min: r.docRange.min, max: r.docRange.max })}
                  </span>
                  <span>
                    <Icon icon={User} />
                    {t('fm.detail.tm', { names: r.technicalManager.name })}
                  </span>
                  {r.submittedAt && (
                    <span>
                      <Icon icon={Send} />
                      {t('daily.submittedAt', { time: formatDayTime(r.submittedAt) })}
                    </span>
                  )}
                </>
              }
            />
            <WeeklyEditor key={r.id} report={r} readOnly />
          </>
        )
      }}
    </QueryState>
  )
}
