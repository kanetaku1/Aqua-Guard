import { addDays, format, parseISO } from 'date-fns'
import { Bell, Calendar, ChevronDown, ChevronLeft, ChevronRight, Send, User } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link, useParams, useSearchParams } from 'react-router'
import { isApiError } from '@/api/client'
import { useDailyReport } from '@/api/queries/reports'
import type { components } from '@/api/schema'
import type { Severity } from '@/api/types'
import { Icon } from '@/components/Icon'
import { Card, PageHeader } from '@/components/Page'
import { QueryState } from '@/components/QueryState'
import { AlertStateText, ReportStateText, StatusMark } from '@/components/StatusMark'
import { useDocumentTitle } from '@/components/useDocumentTitle'
import { cx } from '@/lib/cx'
import { formatCalendarDate, formatDayTime, formatDuration, formatNumber, formatTime } from '@/lib/format'
import { isSensorParameter } from '@/lib/params'

type S = components['schemas']
type DailyReport = S['DailyReport']
const RANK: Severity[] = ['critical', 'warning', 'attention', 'normal']
const worst = (list: Severity[]) => [...list].sort((a, b) => RANK.indexOf(a) - RANK.indexOf(b))[0] ?? 'normal'
const appetiteClass = (a: S['Appetite']) => (a === 'good' ? 'st--normal' : a === 'reduced' ? 'st--attention' : 'st--warning')
const trayClass = (x: S['TrayCondition']) => (x === 'clean' ? 'st--normal' : x === 'leftover' ? 'st--attention' : 'st--warning')

/**
 * FM-05 Daily Report Detail (05 §4 / 06 FM-05 / prototype screens/fm-daily-report.html): what happened on one day.
 * Operations only — no sensor values; current alerts are on Dashboard / Farm Detail. Pond details collapse (`?details=1`).
 */
export function FmDailyReport() {
  useDocumentTitle('FM-05 Daily Report Detail')
  const { t } = useTranslation()
  const { reportId = '' } = useParams()
  const report = useDailyReport(reportId)

  if (isApiError(report.error, 404)) {
    return (
      <section className="card">
        <div className="empty">
          <span className="empty-title">{t('fm.reports.notFound')}</span>
          <Link className="btn btn--link" to="/fm/reports">
            {t('fm.reports.back')}
          </Link>
        </div>
      </section>
    )
  }
  return <QueryState query={report}>{(r) => <DailyBody r={r} />}</QueryState>
}

function DailyBody({ r }: { r: DailyReport }) {
  const { t } = useTranslation()
  const [params] = useSearchParams()
  const date = r.date!
  const included = r.alerts.filter((a) => !a.excluded)
  // Ponds needing attention (04 §7): health noted, or an included alert — a sensor going offline counts too,
  // since the Pond's water quality cannot be monitored meanwhile
  const attention = r.ponds.filter((p) => p.health !== 'normal' || included.some((a) => a.pond.id === p.pond.id))
  const resolved = included.filter((a) => a.resolvedAt).length
  const aerators = r.ponds.reduce((acc, p) => ({ on: acc.on + p.aerators.on, total: acc.total + p.aerators.total }), { on: 0, total: 0 })

  /** One line about the day's alert of a Pond: "DO alert 05:20 · resolved 07:00" / "Turbidity sensor offline from 22:10". */
  const alertLine = (pondId: string) => {
    const a = included.find((x) => x.pond.id === pondId)
    if (!a) return null
    if (!isSensorParameter(a.parameter)) return t('fm.daily.offlineFrom', { title: a.title, time: formatTime(a.occurredAt) })
    const name = t(`paramName.${a.parameter}`)
    return a.resolvedAt
      ? t('fm.daily.alertResolved', { param: name, time: formatTime(a.occurredAt), resolved: formatTime(a.resolvedAt) })
      : t('fm.daily.alertOngoing', { param: name, time: formatTime(a.occurredAt) })
  }

  return (
    <>
      <PageHeader
        breadcrumb={[
          { label: t('nav.reports'), to: '/fm/reports' },
          { label: t('nav.dailyReports'), to: '/fm/reports' },
          { label: `${r.farm.name} · ${formatCalendarDate(date, 'd MMM yyyy')}` },
        ]}
        title={
          <>
            {t('fm.daily.title', { farm: r.farm.name })} <ReportStateText state={r.status} size="lg" />
          </>
        }
        meta={
          <>
            <span>
              <Icon icon={Calendar} />
              {formatCalendarDate(date, 'd MMM yyyy')}
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
        actions={
          <>
            {/* Labelled with the neighbour's own date (wireframe) — a day without a submitted report is skipped, not mislabelled.
                At an end the disabled button shows the adjacent day. */}
            <NavButton id={r.previousReportId} icon={ChevronLeft} label={neighbourLabel(r.previousReportDate, r.date, -1)} name={t('fm.daily.previous')} before />
            <NavButton id={r.nextReportId} icon={ChevronRight} label={neighbourLabel(r.nextReportDate, r.date, 1)} name={t('fm.daily.next')} />
          </>
        }
      />

      {/* 1 Summary */}
      <section className="card">
        <div className="card-body">
          <dl className="dl" style={{ gridTemplateColumns: 'repeat(5,minmax(0,1fr))' }}>
            <div>
              <dt>{t('weekly.summary.condition')}</dt>
              <dd>
                <StatusMark severity={r.farmStatus} />
              </dd>
            </div>
            <div>
              <dt>{t('daily.history.attention')}</dt>
              <dd>
                {t('weekly.summary.of', { n: attention.length, total: r.ponds.length })}
                {attention.length > 0 && ` (${attention.map((p) => p.pond.name.replace('Pond ', '')).join(', ')})`}
              </dd>
            </div>
            <div>
              <dt>{t('daily.history.feed')}</dt>
              <dd className="num">{formatNumber(r.totals.feedKg)} kg</dd>
            </div>
            <div>
              <dt>{t('daily.ponds.mortality')}</dt>
              <dd className="num">{`${formatNumber(r.totals.mortalityPcs)} pcs · ${formatNumber(r.totals.mortalityKg, 2)} kg`}</dd>
            </div>
            <div>
              <dt>{t('fm.daily.alertsDay')}</dt>
              <dd>{t('fm.daily.alertsValue', { count: included.length, resolved })}</dd>
            </div>
          </dl>
        </div>
      </section>

      {/* 2–4 Ponds at a glance */}
      <Card title={t('fm.daily.glance')} sub={t('fm.daily.glanceSub', { date: formatCalendarDate(date) })}>
        <div className="card-body">
          <div className="pond-tiles">
            {r.ponds.map((p) => {
              const sev = worst([p.health, ...included.filter((a) => a.pond.id === p.pond.id).map((a) => a.severity)])
              return (
                <div key={p.pond.id} className={cx('pond-tile', sev !== 'normal' && `is-${sev}`)}>
                  <div className="row-between">
                    <b>{p.pond.name}</b>
                    <StatusMark severity={sev} />
                  </div>
                  <dl className="pond-tile-values">
                    <div>
                      <dt>{t('fm.daily.feed')}</dt>
                      <dd>
                        {formatNumber(p.feedKg)}
                        <small> kg</small>
                      </dd>
                    </div>
                    <div>
                      <dt>{t('daily.appetite')}</dt>
                      <dd>{t(`appetite.${p.appetite}`)}</dd>
                    </div>
                    <div>
                      <dt>{t('daily.ponds.mortality')}</dt>
                      <dd>
                        {formatNumber(p.mortalityPcs)}
                        <small> pcs</small>
                      </dd>
                    </div>
                    <div>
                      <dt>{t('fm.daily.health')}</dt>
                      <dd>{t(`severity.${p.health}`)}</dd>
                    </div>
                  </dl>
                  <div className="pond-tile-note">{alertLine(p.pond.id) ?? ' '}</div>
                </div>
              )
            })}
          </div>
        </div>
      </Card>

      {/* Pond details (collapsed) */}
      <details className="card card-details" open={params.has('details')}>
        <summary className="card-header">
          <div>
            <h2 className="card-title">{t('fm.daily.details')}</h2>
            <div className="card-sub">{t('fm.daily.detailsSub', { count: r.ponds.length })}</div>
          </div>
          <span className="btn btn--link">
            {t('fm.daily.show')}
            <Icon icon={ChevronDown} />
          </span>
        </summary>
        <div className="table-wrap">
          <table className="table table-compact">
            <thead>
              <tr>
                <th rowSpan={2}>{t('daily.ponds.pond')}</th>
                <th colSpan={5}>{t('daily.ponds.feeding')}</th>
                <th colSpan={2}>{t('daily.ponds.mortality')}</th>
                <th rowSpan={2}>{t('fm.daily.health')}</th>
                <th rowSpan={2} className="num">
                  {t('fm.daily.aerators')}
                </th>
                <th rowSpan={2}>{t('daily.ponds.observation')}</th>
              </tr>
              <tr>
                <th className="num">{t('daily.ponds.amount')}</th>
                <th className="num">{t('daily.ponds.rounds')}</th>
                <th>{t('feeding.feedType')}</th>
                <th>{t('daily.appetite')}</th>
                <th>{t('daily.ponds.tray')}</th>
                <th className="num">pcs</th>
                <th className="num">{t('daily.ponds.weight')}</th>
              </tr>
            </thead>
            <tbody>
              {r.ponds.map((p) => (
                <tr key={p.pond.id}>
                  <td className="cell-main">{p.pond.name}</td>
                  <td className="num">{formatNumber(p.feedKg)} kg</td>
                  <td className="num">
                    {p.feedRounds} / {p.feedRoundsPlanned}
                  </td>
                  <td>{p.feedType ?? '—'}</td>
                  <td>
                    <span className={cx('status-text', appetiteClass(p.appetite))}>{t(`appetite.${p.appetite}`)}</span>
                  </td>
                  <td>
                    <span className={cx('status-text', trayClass(p.tray))}>{t(`tray.${p.tray}`)}</span>
                  </td>
                  <td className="num">{formatNumber(p.mortalityPcs)}</td>
                  <td className="num">{formatNumber(p.mortalityKg, 2)} kg</td>
                  <td>
                    <span className={cx('status-text', `st--${p.health}`)}>{t(`severity.${p.health}`)}</span>
                  </td>
                  <td className="num">
                    {p.aerators.on} / {p.aerators.total}
                  </td>
                  <td className="wrap text-secondary" style={{ minWidth: 200 }}>
                    {[...p.observations.map((o) => t(`healthObservation.${o}`)), p.healthNote].filter(Boolean).join(' · ') || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td>{r.farm.name}</td>
                <td className="num">{formatNumber(r.totals.feedKg)} kg</td>
                <td />
                <td />
                <td>{t('daily.ponds.reduced', { count: r.totals.reducedAppetitePonds })}</td>
                <td>{t('daily.ponds.leftover', { count: r.totals.leftoverTrayPonds })}</td>
                <td className="num">{formatNumber(r.totals.mortalityPcs)}</td>
                <td className="num">{formatNumber(r.totals.mortalityKg, 2)} kg</td>
                <td>{t('daily.ponds.noted', { count: r.totals.healthNotedPonds })}</td>
                <td />
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      </details>

      <div className="grid cols-2">
        {/* 5 Environment / Weather */}
        <Card title={t('daily.env.title')}>
          <div className="card-body">
            <dl className="dl dl-2">
              <div>
                <dt>{t('daily.env.weather')}</dt>
                <dd>{r.environment.weather ? t(`weather.${r.environment.weather}`) : '—'}</dd>
              </div>
              <div>
                <dt>{t('daily.env.rainfall')}</dt>
                <dd className="num">{r.environment.rainfallMm == null ? '—' : `${formatNumber(r.environment.rainfallMm)} mm`}</dd>
              </div>
              <div style={{ gridColumn: 'span 2' }}>
                <dt>{t('daily.env.events')}</dt>
                <dd>{r.environment.events ?? '—'}</dd>
              </div>
            </dl>
          </div>
        </Card>
        {/* 6 Equipment Status */}
        <Card title={t('daily.equipment.title')} sub={t('fm.daily.equipmentSub', { on: aerators.on, total: aerators.total })}>
          {r.equipmentEvents.length === 0 ? (
            <div className="empty">
              <span className="empty-title">{t('daily.equipment.none')}</span>
            </div>
          ) : (
            <table className="table table-compact">
              <thead>
                <tr>
                  <th>{t('daily.equipment.equipment')}</th>
                  <th>{t('daily.equipment.failure')}</th>
                  <th>{t('daily.equipment.action')}</th>
                  <th>{t('daily.equipment.status')}</th>
                </tr>
              </thead>
              <tbody>
                {r.equipmentEvents.map((e) => (
                  <tr key={e.id}>
                    <td>
                      <div className="cell-main">{e.equipment}</div>
                      {e.pond && <div className="cell-sub">{e.pond.name}</div>}
                    </td>
                    <td>
                      <div>{e.failure}</div>
                      <div className="cell-sub">{formatTime(e.occurredAt)}</div>
                    </td>
                    <td className="wrap">{e.action ?? '—'}</td>
                    <td>
                      <span className={cx('status-text', e.status === 'resolved' ? 'st--resolved' : 'st--progress')}>{t(`daily.equipment.${e.status}`)}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>

      {/* 7 Major Alerts / Issues */}
      <Card
        title={t('daily.alerts.title')}
        sub={t('fm.daily.alertsSub', { date: formatCalendarDate(date) })}
        action={
          <span className="source-tag">
            <Icon icon={Bell} />
            {t('daily.alerts.source')}
          </span>
        }
      >
        {included.length === 0 ? (
          <div className="empty">
            <span className="empty-title">{t('daily.alerts.none')}</span>
          </div>
        ) : (
          <table className="table table-compact">
            <thead>
              <tr>
                <th>{t('daily.ponds.pond')}</th>
                <th>{t('pondAlerts.alert')}</th>
                <th>{t('pondAlerts.severity')}</th>
                <th>{t('pondAlerts.occurred')}</th>
                <th>{t('alertDrawer.duration')}</th>
                <th>{t('fm.col.status')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {included.map((a) => (
                <tr key={a.id}>
                  <td className="cell-main">{a.pond.name}</td>
                  <td className="wrap">{a.title}</td>
                  <td>
                    <StatusMark severity={a.severity} />
                  </td>
                  <td>{formatTime(a.occurredAt)}</td>
                  <td>{a.resolvedAt ? formatDuration(a.occurredAt, a.resolvedAt) : t('alertDrawer.ongoing')}</td>
                  <td>
                    <AlertStateText state={a.state} />
                  </td>
                  <td className="actions">
                    <Link className="btn btn--link" to={`/fm/farms/${r.farm.id}`}>
                      {t('fm.daily.viewInFarm')}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {/* 8 Actions Taken */}
      <Card title={t('daily.actions.title')}>
        {r.actions.length === 0 ? (
          <div className="empty">
            <span className="empty-title">{t('daily.actions.none')}</span>
          </div>
        ) : (
          <table className="table table-compact">
            <thead>
              <tr>
                <th>{t('daily.time')}</th>
                <th>{t('daily.ponds.pond')}</th>
                <th>{t('daily.actions.action')}</th>
                <th>{t('daily.actions.outcome')}</th>
              </tr>
            </thead>
            <tbody>
              {r.actions.map((a) => (
                <tr key={a.id}>
                  <td className="text-muted">{formatTime(a.at)}</td>
                  <td>{a.pond?.name ?? t('daily.farmWide')}</td>
                  <td className="wrap">{a.action}</td>
                  <td className="wrap">{a.outcome ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {/* 9 Technical Manager Summary */}
      <section className="card">
        <div className="card-header">
          <h2 className="card-title">{t('daily.summary.title')}</h2>
          <span className="caption">— {r.technicalManager.name}</span>
        </div>
        <div className="card-body">
          <div className="prose">
            <p>{r.summary ?? '—'}</p>
          </div>
        </div>
      </section>
    </>
  )
}

const neighbourLabel = (neighbour: string | null, date: string | undefined, offset: number) =>
  neighbour ? formatCalendarDate(neighbour) : date ? formatCalendarDate(format(addDays(parseISO(date), offset), 'yyyy-MM-dd')) : ''

/** ← previous day / next day → of the same Farm (disabled at the ends). `name` is the accessible name. */
function NavButton({ id, icon, label, name, before }: { id: string | null; icon: typeof ChevronLeft; label: string; name: string; before?: boolean }) {
  const content = before ? (
    <>
      <Icon icon={icon} />
      {label}
    </>
  ) : (
    <>
      {label}
      <Icon icon={icon} />
    </>
  )
  return id ? (
    <Link className="btn btn--outline" to={`/fm/reports/daily/${id}`} aria-label={`${name} · ${label}`}>
      {content}
    </Link>
  ) : (
    <button type="button" className="btn btn--outline" disabled aria-label={`${name} · ${label}`}>
      {content}
    </button>
  )
}
