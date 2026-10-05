import { ArrowRight, TrendingDown, TrendingUp } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { useCompanyProduction, useFarms, useIssues } from '@/api/queries/farms'
import type { Severity } from '@/api/types'
import { Icon } from '@/components/Icon'
import { Kpi } from '@/components/Kpi'
import { Card, PageHeader } from '@/components/Page'
import { QueryState } from '@/components/QueryState'
import { useDocumentTitle } from '@/components/useDocumentTitle'
import { cx } from '@/lib/cx'
import { formatCalendarDate, formatNumber } from '@/lib/format'
import { FarmRow, IssueRow } from './FarmComponents'
import { sortFarms } from './farmUtils'

const SEVERITIES: Severity[] = ['critical', 'warning', 'attention', 'normal']

/**
 * FM-01 Dashboard (05 §4 / 06 FM-01 / prototype screens/fm-dashboard.html): which Farm to look at.
 * Farm status, live Risk / Issue from alerts, and Company production totals. No raw sensor data (02 §5.1).
 */
export function FmDashboard() {
  useDocumentTitle('FM-01 Dashboard')
  const { t } = useTranslation()
  const farms = useFarms()
  const issues = useIssues()
  const production = useCompanyProduction()
  const pondTotal = farms.data?.items.reduce((s, f) => s + f.pondCount, 0)

  return (
    <>
      <PageHeader
        title={t('fm.dashboard.title')}
        meta={farms.data && <span>{t('fm.dashboard.meta', { farms: farms.data.items.length, ponds: pondTotal })}</span>}
      />

      {/* 1 Farm Status */}
      <Card
        title={t('fm.farmStatus.title')}
        sub={t('fm.farmStatus.sub')}
        action={
          <Link className="btn btn--link" to="/fm/farms">
            {t('fm.farmStatus.all')}
            <Icon icon={ArrowRight} />
          </Link>
        }
      >
        <QueryState query={farms}>
          {(data) => (
            <>
              <div className="status-summary" style={{ borderBottom: '1px solid var(--color-border)' }}>
                {SEVERITIES.map((s) => (
                  <div key={s} className="status-count">
                    <span className={cx('status-text', `st--${s}`)}>{t(`severity.${s}`)}</span>
                    <div className="status-count-value">
                      {data.counts[s]}
                      <small>{t('fm.farm', { count: data.counts[s] })}</small>
                    </div>
                  </div>
                ))}
              </div>
              <FarmTable farms={sortFarms(data.items)} />
            </>
          )}
        </QueryState>
      </Card>

      {/* 2 Risk / Issue */}
      <Card title={t('fm.issues.title')} sub={issues.data && t('fm.issues.sub', { count: issues.data.items.length })}>
        <QueryState query={issues}>
          {(data) =>
            data.items.length === 0 ? (
              <div className="empty">
                <span className="empty-title">{t('fm.issues.none')}</span>
              </div>
            ) : (
              <div className="alert-list">
                {data.items.map((issue) => (
                  <IssueRow
                    key={issue.id}
                    issue={issue}
                    action={
                      <Link className="btn btn--link btn--sm" to={`/fm/farms/${issue.farm.id}`}>
                        {t('fm.issues.viewFarm')}
                      </Link>
                    }
                  />
                ))}
              </div>
            )
          }
        </QueryState>
      </Card>

      {/* 3 Production Status */}
      <section className="stack">
        <div className="row-between">
          <h2 className="section-label">{t('fm.production.title')}</h2>
          {production.data && <span className="caption">{t('fm.production.caption', { date: formatCalendarDate(production.data.latestSamplingDate) })}</span>}
        </div>
        <QueryState query={production}>
          {(p) => {
            const biomassDiff = p.previous ? Math.round((p.biomassKg - p.previous.biomassKg) / 100) / 10 : null
            const srDiff = p.previous ? Math.round(p.survivalRatePct - p.previous.survivalRatePct) : null
            const behindDiff = p.previous ? p.pondsBehind - p.previous.pondsBehind : null
            const signed = (n: number, text: string) => `${n > 0 ? '+' : n < 0 ? '−' : '±'}${text}`
            return (
              <div className="grid cols-3 gap-4">
                <Kpi
                  name={t('fm.production.biomass')}
                  type={t('valueType.estimated')}
                  value={formatNumber(p.biomassKg / 1000, 1)}
                  unit="t"
                  compare={biomassDiff !== null && t('fm.production.vsLastWeek', { value: signed(biomassDiff, `${formatNumber(Math.abs(biomassDiff), 1)} t`) })}
                  compareIcon={biomassDiff !== null ? (biomassDiff >= 0 ? TrendingUp : TrendingDown) : undefined}
                  basis={t('fm.production.biomassBasis', { count: p.pondsTotal, date: formatCalendarDate(p.latestSamplingDate) })}
                />
                <Kpi
                  name={t('fm.production.sr')}
                  type={t('valueType.estimated')}
                  value={formatNumber(p.survivalRatePct)}
                  unit="%"
                  compare={srDiff !== null && t('fm.production.vsLastWeek', { value: signed(srDiff, `${Math.abs(srDiff)} pt`) })}
                  compareIcon={srDiff !== null ? (srDiff >= 0 ? TrendingUp : TrendingDown) : undefined}
                  basis={t('fm.production.srBasis', { count: p.pondsTotal, date: formatCalendarDate(p.latestSamplingDate) })}
                />
                <Kpi
                  name={t('fm.production.behind')}
                  type={t('valueType.actual')}
                  value={`${p.pondsBehind} / ${p.pondsTotal}`}
                  unit={t('fm.production.ponds')}
                  compare={behindDiff !== null && t('fm.production.vsLastWeek', { value: signed(behindDiff, String(Math.abs(behindDiff))) })}
                  compareIcon={behindDiff !== null ? (behindDiff >= 0 ? TrendingUp : TrendingDown) : undefined}
                  basis={t('fm.production.behindBasis')}
                />
              </div>
            )
          }}
        </QueryState>
      </section>
    </>
  )
}

function FarmTable({ farms }: { farms: Parameters<typeof sortFarms>[0] }) {
  const { t } = useTranslation()
  const sub = (key: string) => (
    <div className="caption" style={{ fontWeight: 400 }}>
      {t(key)}
    </div>
  )
  return (
    <table className="table">
      <thead>
        <tr>
          <th>{t('fm.col.farm')}</th>
          <th>{t('fm.col.status')}</th>
          <th>{t('fm.col.reason')}</th>
          <th>
            {t('fm.col.water')}
            {sub('fm.col.waterSub')}
          </th>
          <th>
            {t('fm.col.growth')}
            {sub('fm.col.growthSub')}
          </th>
          <th>{t('fm.col.operations')}</th>
          <th />
        </tr>
      </thead>
      <tbody>
        {farms.map((f) => (
          <FarmRow key={f.id} farm={f} />
        ))}
      </tbody>
    </table>
  )
}
