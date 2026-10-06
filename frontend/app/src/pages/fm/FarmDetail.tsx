import { Clock, FileText, MapPin, TrendingDown, TrendingUp, TriangleAlert, User, Waves, type LucideIcon } from 'lucide-react'
import { useCallback } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { Link, useParams, useSearchParams } from 'react-router'
import { isApiError } from '@/api/client'
import { useFarm, useFarmProduction, useIssues, useStatusTrend } from '@/api/queries/farms'
import type { components } from '@/api/schema'
import type { FarmDetail, Severity } from '@/api/types'
import { GrowthVsTargetChart } from '@/components/Charts'
import { Icon } from '@/components/Icon'
import { Kpi } from '@/components/Kpi'
import { Card, PageHeader } from '@/components/Page'
import { QueryState } from '@/components/QueryState'
import { AlertStateText, StatusMark } from '@/components/StatusMark'
import { useDocumentTitle } from '@/components/useDocumentTitle'
import { cx } from '@/lib/cx'
import { formatCalendarDate, formatDayTime, formatElapsed, formatNumber, formatRecentTime, formatSignedPct } from '@/lib/format'
import { isSensorParameter } from '@/lib/params'
import { IssueDrawer } from './IssueDrawer'

type S = components['schemas']
const ASPECTS = ['waterQuality', 'growth', 'operations'] as const
const RANK: Severity[] = ['critical', 'warning', 'attention', 'normal']

/**
 * FM-03 Farm Detail — the Farms Manager's main screen (05 §4 / 06 FM-03 / prototype screens/fm-farm-detail.html).
 * What is happening on one Farm: status with its facts, live Risk / Issue, production. Not a raw-data screen;
 * no links into Technical Manager screens (05 §2.3). `?issue=<id>` opens the read-only alert drawer.
 */
export function FmFarmDetail() {
  useDocumentTitle('FM-03 Farm Detail')
  const { t } = useTranslation()
  const { farmId = '' } = useParams()
  const farm = useFarm(farmId)
  const [params, setParams] = useSearchParams()
  const issueId = params.get('issue')
  const closeIssue = useCallback(
    () =>
      setParams(
        (p) => {
          p.delete('issue')
          return p
        },
        { replace: true },
      ),
    [setParams],
  )

  if (isApiError(farm.error, 404)) {
    return (
      <section className="card">
        <div className="empty">
          <span className="empty-title">{t('fm.detail.notFound')}</span>
          <Link className="btn btn--link" to="/fm/farms">
            {t('fm.detail.back')}
          </Link>
        </div>
      </section>
    )
  }

  return (
    <QueryState query={farm}>
      {(f) => (
        <>
          <PageHeader
            breadcrumb={[{ label: t('nav.dashboard'), to: '/fm/dashboard' }, { label: t('nav.farms'), to: '/fm/farms' }, { label: f.name }]}
            title={
              <>
                {f.name} <StatusMark severity={f.status} size="lg" />
              </>
            }
            meta={
              <>
                <span>
                  <Icon icon={MapPin} />
                  {f.location}
                </span>
                <span>
                  <Icon icon={User} />
                  {t('fm.detail.tm', { names: f.technicalManagers.map((m) => m.name).join(', ') })}
                </span>
                <span>
                  <Icon icon={Waves} />
                  {t('fm.detail.ponds', { count: f.pondCount, min: f.docRange.min, max: f.docRange.max })}
                </span>
                <span>
                  <Icon icon={Clock} />
                  {t('pond.lastUpdated', { time: formatRecentTime(f.updatedAt) })}
                </span>
                {f.latestReport && (
                  <span>
                    <Icon icon={FileText} />
                    <Link to={`/fm/reports/${f.latestReport.type}/${f.latestReport.id}`}>
                      {t('fm.detail.latestReport', { label: t(`reportType.${f.latestReport.type}`), date: f.latestReport.date ? formatCalendarDate(f.latestReport.date) : '' })}
                    </Link>
                  </span>
                )}
              </>
            }
          />
          <FarmStatusCard farm={f} />
          <IssuesCard farmId={f.id} />
          <ProductionSection farm={f} />
          {issueId && <IssueDrawer issueId={issueId} onClose={closeIssue} />}
        </>
      )}
    </QueryState>
  )
}

// ── 1 Farm Status ──

function FarmStatusCard({ farm }: { farm: FarmDetail }) {
  const { t } = useTranslation()
  const trend = useStatusTrend(farm.id)
  // The Farm status is the most severe aspect (04 §7); name it in one sentence
  const worst = [...ASPECTS].sort((a, b) => RANK.indexOf(farm[a].status) - RANK.indexOf(farm[b].status))[0]
  return (
    <Card
      title={t('fm.farmStatus.title')}
      sub={
        farm.status === 'normal' ? (
          t('fm.detail.allNormal', { farm: farm.name })
        ) : (
          <Trans
            i18nKey="fm.detail.because"
            values={{ farm: farm.name, status: t(`severity.${farm.status}`), aspect: t(`fm.aspect.${worst}`) }}
            components={{ b: <b /> }}
          />
        )
      }
    >
      <div className="card-body stack">
        <div className="grid cols-3 gap-4">
          {ASPECTS.map((key) => {
            const a = farm[key]
            return (
              <div key={key} className="status-tile">
                <div className="row-between">
                  <span className="status-tile-label">{t(`fm.aspect.${key}`)}</span>
                  <span className={cx('status-text', `st--${a.status}`)}>{t(`severity.${a.status}`)}</span>
                </div>
                <div className="status-count-value" style={{ margin: 0 }}>
                  {a.count ?? 0}
                  <small>{t(`fm.tile.${key}`, { count: a.count ?? 0, total: farm.pondCount })}</small>
                </div>
                {a.detail && <span className="status-tile-note">{a.detail}</span>}
              </div>
            )
          })}
        </div>
        <QueryState query={trend}>
          {(data) => (
            <div>
              <div className="row-between" style={{ marginBottom: 8 }}>
                <span className="subsection-title" style={{ margin: 0 }}>
                  {t('fm.detail.trend')}
                </span>
                <span className="caption">{t('fm.detail.trendSub', { count: data.items.length })}</span>
              </div>
              <div className="status-strip" role="img" aria-label={t('fm.detail.trend')}>
                {data.items.map((d) => (
                  <span key={d.date} className={`s-${d.status}`} title={`${formatCalendarDate(d.date)} · ${t(`severity.${d.status}`)}`} />
                ))}
              </div>
              {data.items.length > 0 && (
                <div className="row-between caption" style={{ marginTop: 6 }}>
                  <span>{formatCalendarDate(data.items[0].date)}</span>
                  <span>{formatCalendarDate(data.items[data.items.length - 1].date)}</span>
                </div>
              )}
            </div>
          )}
        </QueryState>
      </div>
    </Card>
  )
}

// ── 2 Risk / Issue ──

function IssuesCard({ farmId }: { farmId: string }) {
  const { t } = useTranslation()
  const issues = useIssues(farmId)
  return (
    <Card title={t('fm.issues.title')} sub={issues.data && t('fm.detail.issuesSub', { count: issues.data.items.length })}>
      <QueryState query={issues}>
        {(data) =>
          data.items.length === 0 ? (
            <div className="empty">
              <span className="empty-title">{t('fm.issues.none')}</span>
            </div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>{t('fm.detail.issue')}</th>
                  <th>{t('pondAlerts.severity')}</th>
                  <th>{t('daily.alerts.handling')}</th>
                  <th>{t('alertDrawer.duration')}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.items.map((i) => (
                  <tr key={i.id}>
                    <td>
                      <div className="cell-main">
                        {i.pond.name} · {isSensorParameter(i.parameter) ? t(`paramName.${i.parameter}`) : t(`issueParam.${i.parameter}`, { defaultValue: i.parameter })}{' '}
                        <span className="trend" style={{ fontWeight: 400 }}>
                          <Icon icon={i.trend === 'decreasing' ? TrendingDown : TrendingUp} />
                          {t(`trendLabel.${i.trend}`)}
                        </span>
                      </div>
                      <div className="cell-sub">{t(`issueType.${i.issueType}`)}</div>
                    </td>
                    <td>
                      <StatusMark severity={i.severity} />
                    </td>
                    <td>
                      <AlertStateText state={i.handling} />
                    </td>
                    <td>
                      <div>
                        {t(i.state === 'ongoing' ? 'fm.detail.ongoing' : 'fm.detail.resolved', { duration: formatElapsed(i.since, i.resolvedAt ?? undefined) })}
                      </div>
                      <div className="cell-sub">{t('fm.detail.since', { time: formatDayTime(i.since) })}</div>
                    </td>
                    <td className="actions">
                      <Link className="btn btn--link" to={`?issue=${i.id}`}>
                        {t('daily.alerts.viewAlert')}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        }
      </QueryState>
    </Card>
  )
}

// ── 3 Production Status ──

function ProductionSection({ farm }: { farm: FarmDetail }) {
  const { t } = useTranslation()
  const production = useFarmProduction(farm.id)
  return (
    <section className="stack">
      <div className="row-between">
        <h2 className="section-label">{t('fm.production.title')}</h2>
        {production.data && <span className="caption">{t('fm.detail.productionCaption', { date: formatCalendarDate(production.data.samplingDate) })}</span>}
      </div>
      <QueryState query={production}>{(p) => <ProductionBody farm={farm} p={p} />}</QueryState>
    </section>
  )
}

function ProductionBody({ farm, p }: { farm: FarmDetail; p: S['FarmProduction'] }) {
  const { t } = useTranslation()
  const k = p.kpis
  const prev = k.previous
  const behind = p.ponds.filter((x) => x.growth === 'behind')
  const diff = (now: number, before: number | undefined, digits: number, unit = ''): { text?: string; icon?: LucideIcon } => {
    if (before === undefined) return {}
    const d = Math.round((now - before) * 10 ** digits) / 10 ** digits
    const sign = d > 0 ? '+' : d < 0 ? '−' : '±'
    return { text: t('fm.production.vsLastWeek', { value: `${sign}${formatNumber(Math.abs(d), digits)}${unit}` }), icon: d >= 0 ? TrendingUp : TrendingDown }
  }
  const b = diff(k.biomassKg / 1000, prev?.biomassKg === undefined ? undefined : prev.biomassKg / 1000, 1, ' t')
  const sr = diff(k.survivalRatePct, prev?.survivalRatePct, 0, ' pt')
  const fcr = diff(k.fcr, prev?.fcr, 2)
  const onTrack = k.growthDistribution.onTrack + k.growthDistribution.ahead

  return (
    <>
      <div className="grid kpis gap-4">
        <Kpi name={t('weekly.kpi.biomass')} type={t('valueType.estimated')} value={formatNumber(k.biomassKg / 1000, 1)} unit="t" compare={b.text} compareIcon={b.icon} basis={t('weekly.kpi.biomassBasis', { count: p.ponds.length })} />
        <Kpi name={t('weekly.kpi.sr')} type={t('valueType.estimated')} value={formatNumber(k.survivalRatePct)} unit="%" compare={sr.text} compareIcon={sr.icon} basis={t('weekly.kpi.srBasis')} />
        <Kpi name={t('weekly.kpi.fcr')} type={t('valueType.actual')} value={formatNumber(k.fcr, 2)} compare={fcr.text} compareIcon={fcr.icon} basis={t('weekly.kpi.fcrBasis')} />
        <Kpi
          name={t('weekly.kpi.growth')}
          type={t('valueType.actual')}
          value={`${onTrack} / ${p.ponds.length}`}
          unit={t('weekly.kpi.onTrack')}
          compare={behind.length ? t('weekly.kpi.behind', { count: behind.length, ponds: behind.map((x) => x.pond.name.replace('Pond ', '')).join(', ') }) : t('weekly.kpi.noneBehind')}
          compareIcon={behind.length ? TriangleAlert : undefined}
          basis={t('fm.detail.behindRule')}
        />
      </div>

      <div className="card">
        <div className="card-header">
          <div>
            <h3 className="card-title">{t('fm.detail.pps')}</h3>
            <div className="card-sub">{t('fm.detail.ppsSub')}</div>
          </div>
          <span className="caption">{t('fm.detail.estimated')}</span>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>{t('daily.ponds.pond')}</th>
                <th>{t('fm.detail.stocked')}</th>
                <th className="num">DOC</th>
                <th className="num">ABW</th>
                <th className="num">{t('fm.detail.target')}</th>
                <th>{t('tmPonds.vsTarget')}</th>
                <th className="num">ADG</th>
                <th className="num">SR</th>
                <th className="num">FCR</th>
                <th className="num">{t('weekly.kpi.biomass')}</th>
              </tr>
            </thead>
            <tbody>
              {p.ponds.map((x) => (
                <tr key={x.pond.id}>
                  <td className="cell-main">{x.pond.name}</td>
                  <td className="text-muted">{x.stockedOn ? formatCalendarDate(x.stockedOn) : '—'}</td>
                  <td className="num">{x.doc ?? '—'}</td>
                  <td className="num">{x.abwG == null ? '—' : `${formatNumber(x.abwG, 1)} g`}</td>
                  <td className="num text-muted">{x.targetAbwG == null ? '—' : `${formatNumber(x.targetAbwG, 1)} g`}</td>
                  <td>
                    {x.vsTargetPct == null || !x.growth ? (
                      <span className="text-muted">—</span>
                    ) : (
                      <span className={cx('status-text', x.growth === 'behind' ? 'st--attention' : 'st--normal')}>
                        {formatSignedPct(x.vsTargetPct)} {t(`growth.${x.growth}`)}
                      </span>
                    )}
                  </td>
                  <td className="num">{x.adgGPerDay == null ? '—' : formatNumber(x.adgGPerDay, 2)}</td>
                  <td className="num">{x.survivalRatePct == null ? '—' : `${formatNumber(x.survivalRatePct)}%`}</td>
                  <td className="num">{x.fcr == null ? '—' : formatNumber(x.fcr, 2)}</td>
                  <td className="num">{x.biomassKg == null ? '—' : `${formatNumber(x.biomassKg / 1000, 2)} t`}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td>{farm.name}</td>
                <td className="text-muted">{t('fm.farmSub', { count: p.ponds.length })}</td>
                <td className="num">
                  {farm.docRange.min}–{farm.docRange.max}
                </td>
                <td className="num text-muted">—</td>
                <td className="num text-muted">—</td>
                <td>{t('fm.detail.distribution', { onTrack, behind: k.growthDistribution.behind })}</td>
                <td className="num text-muted">—</td>
                <td className="num">{formatNumber(k.survivalRatePct)}%</td>
                <td className="num">{formatNumber(k.fcr, 2)}</td>
                <td className="num">{formatNumber(k.biomassKg / 1000, 1)} t</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <div>
            <h3 className="card-title">{t('weekly.growthChart.title')}</h3>
            <div className="card-sub">{t('fm.detail.chartSub')}</div>
          </div>
          <div className="chart-legend">
            <span>
              <i className="legend-line dashed" />
              {t('fm.detail.targetAbw')}
            </span>
            <span>
              <i className="legend-band" style={{ background: '#EDF4F2', borderColor: '#B2D0C4' }} />
              {t('fm.detail.band')}
            </span>
            <span className="status-text st--normal">{t('growth.on_track')}</span>
            <span className="status-text st--attention">{t('growth.behind')}</span>
          </div>
        </div>
        <div className="card-body">
          <GrowthVsTargetChart
            height={240}
            tickStep={7}
            curve={p.growthCurve}
            points={p.ponds.filter((x) => x.doc != null && x.abwG != null).map((x) => ({ doc: x.doc!, abw: x.abwG!, label: x.pond.name.replace('Pond ', 'P'), behind: x.growth === 'behind' }))}
          />
        </div>
      </div>
    </>
  )
}
