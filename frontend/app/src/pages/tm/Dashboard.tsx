import type { Marker as LeafletMarker } from 'leaflet'
import { ArrowRight, Clock, Droplets, Fan, Radio, Scale, Utensils, Warehouse, Waves, Zap, type LucideIcon } from 'lucide-react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Marker, Tooltip } from 'react-leaflet'
import { Link, useNavigate } from 'react-router'
import { useOpenAlerts } from '@/api/queries/alerts'
import { useCurrentUser } from '@/api/queries/auth'
import { useFarm, useOperationalStatus, usePondWaterQuality, useReportStatus } from '@/api/queries/farms'
import type {
  Alert,
  OperationalStatus,
  ParameterRange,
  PondWaterQualityRow,
  ReportStatusItem,
  ReportStatusSummary,
  SensorValue,
  Severity,
  SeverityCounts,
} from '@/api/types'
import { Icon } from '@/components/Icon'
import { Card, PageHeader } from '@/components/Page'
import { PondMap } from '@/components/PondMap'
import { useDocumentTitle } from '@/components/useDocumentTitle'
import { QueryState } from '@/components/QueryState'
import { AlertStateText, ReportStateText, StatusMark } from '@/components/StatusMark'
import { cx } from '@/lib/cx'
import { formatCalendarDate, formatDue, formatNumber, formatRecentTime, formatWeek } from '@/lib/format'
import { DIGITS, SENSOR_PARAMS, UNIT } from '@/lib/params'
import { pondIcon } from '@/lib/pondMap'

/**
 * TM-01 Dashboard (05 §5 / 06 TM-01 / prototype screens/tm-dashboard.html):
 * which Pond needs attention now. Values and statuses come from the backend; this screen only displays them.
 */
export function TmDashboard() {
  useDocumentTitle('TM-01 Dashboard')
  const { t } = useTranslation()
  const me = useCurrentUser()
  const farmId = me.farm?.id ?? ''
  const farm = useFarm(farmId)

  return (
    <>
      <PageHeader
        title={t('tmDashboard.title')}
        meta={
          farm.data && (
            <span>
              <Icon icon={Warehouse} />
              {t('tmDashboard.meta', {
                farm: farm.data.name,
                count: farm.data.pondCount,
                min: farm.data.docRange.min,
                max: farm.data.docRange.max,
              })}
            </span>
          )
        }
      />
      <PondStatusCard farmId={farmId} />
      <div className="grid cols-8-4">
        <ActiveAlertsCard farmId={farmId} />
        <div className="stack" style={{ gap: 24 }}>
          <OperationalStatusCard farmId={farmId} />
          <ReportStatusCard farmId={farmId} />
        </div>
      </div>
    </>
  )
}

// ── 1. Pond Status (TM-D-001, 003, 006) ──

const PARAMS = SENSOR_PARAMS
const SEVERITY_ORDER: Severity[] = ['critical', 'warning', 'attention', 'normal']
const rank = (s: Severity) => SEVERITY_ORDER.indexOf(s)

/** Most severe first; among equals, Ponds with open alerts first, then by name (same order as the prototype). */
function sortPonds(rows: PondWaterQualityRow[]): PondWaterQualityRow[] {
  return [...rows].sort(
    (a, b) => rank(a.status) - rank(b.status) || b.openAlerts - a.openAlerts || a.pond.name.localeCompare(b.pond.name),
  )
}

function PondStatusCard({ farmId }: { farmId: string }) {
  const { t } = useTranslation()
  const query = usePondWaterQuality(farmId)
  return (
    <Card
      title={t('tmDashboard.pondStatus')}
      sub={t('tmDashboard.pondStatusSub')}
      action={
        <Link className="btn btn--link" to="/tm/ponds">
          {t('tmDashboard.allPonds')}
          <Icon icon={ArrowRight} />
        </Link>
      }
    >
      <QueryState query={query}>
        {(data) => (
          <>
            <StatusSummary counts={data.counts} />
            <PondStatusMap rows={data.items} />
            <div className="card-footer" style={{ justifyContent: 'flex-start' }}>
              <span className="caption">{t('tmDashboard.normalRange', { ranges: formatRanges(data.normalRanges, t) })}</span>
            </div>
          </>
        )}
      </QueryState>
    </Card>
  )
}

function StatusSummary({ counts }: { counts: SeverityCounts }) {
  const { t } = useTranslation()
  return (
    <div className="status-summary" style={{ borderBottom: '1px solid var(--color-border)' }}>
      {SEVERITY_ORDER.map((s) => (
        <div key={s} className="status-count">
          <span className={cx('status-text', `st--${s}`)}>{t(`severity.${s}`)}</span>
          <div className="status-count-value">
            {counts[s]}
            <small>{t('common.pond', { count: counts[s] })}</small>
          </div>
        </div>
      ))}
    </div>
  )
}

/** Each Pond at its position in its status color, values on hover / focus (07 §7 Pond Map). Ponds without a position are listed below. */
function PondStatusMap({ rows }: { rows: PondWaterQualityRow[] }) {
  const { t } = useTranslation()
  const sorted = sortPonds(rows)
  const located = sorted.filter((r) => r.location)
  const unset = sorted.filter((r) => !r.location)
  return (
    <>
      <div className="card-body">
        {located.length === 0 ? (
          <div className="empty">
            <span className="empty-title">{t('tmDashboard.noLocations')}</span>
            <span>{t('tmDashboard.noLocationsHelp')}</span>
          </div>
        ) : (
          <PondMap points={located.map((r) => r.location!)} label={t('tmDashboard.mapLabel')}>
            {located.map((row) => (
              <PondMarker key={row.pond.id} row={row} />
            ))}
          </PondMap>
        )}
      </div>
      {unset.length > 0 && (
        <div className="pond-map-unset">
          <span className="pond-map-unset-title">{t('tmDashboard.locationNotSet')}</span>
          {unset.map((row) => (
            <Link key={row.pond.id} to={`/tm/ponds/${row.pond.id}`}>
              {row.pond.name}
              <StatusMark severity={row.status} size="xs" />
            </Link>
          ))}
        </div>
      )}
    </>
  )
}

function PondMarker({ row }: { row: PondWaterQualityRow }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const to = `/tm/ponds/${row.pond.id}`
  const icon = useMemo(() => pondIcon(row.status, row.pond.name), [row.status, row.pond.name])
  const label = `${row.pond.name}, ${t(`severity.${row.status}`)}`
  return (
    <Marker
      position={[row.location!.lat, row.location!.lng]}
      icon={icon}
      title={label}
      // The most severe stays on top where markers overlap
      zIndexOffset={(SEVERITY_ORDER.length - rank(row.status)) * 100}
      eventHandlers={{
        click: () => navigate(to),
        // Not hover only: keyboard focus opens the same tooltip, and Enter opens the Pond (Leaflet fires click)
        add: (e) => {
          const marker = e.target as LeafletMarker
          const el = marker.getElement()
          el?.setAttribute('aria-label', label)
          el?.addEventListener('focus', () => marker.openTooltip())
          el?.addEventListener('blur', () => marker.closeTooltip())
        },
      }}
    >
      <Tooltip className="pond-tip" direction="top" offset={[0, -16]}>
        <PondTip row={row} />
      </Tooltip>
    </Marker>
  )
}

/** The same values as the former Pond Status table row. */
function PondTip({ row }: { row: PondWaterQualityRow }) {
  const { t } = useTranslation()
  return (
    <>
      <div className="pond-tip-head">
        <span className="pond-tip-name">{row.pond.name}</span>
        <StatusMark severity={row.status} size="xs" />
      </div>
      <table className="pond-tip-table">
        <tbody>
          {PARAMS.map((p) => (
            <tr key={p}>
              <th scope="row">{[t(`param.${p}`), UNIT[p]].filter(Boolean).join(' ')}</th>
              <SensorCell value={row.values[p]} digits={DIGITS[p]} />
            </tr>
          ))}
          <tr className="pond-tip-alerts">
            <th scope="row">{t('tmDashboard.alerts')}</th>
            <td>
              {row.openAlerts > 0 && row.worstAlertState ? (
                <AlertStateText state={row.worstAlertState} count={row.openAlerts} />
              ) : (
                <span className="text-muted">—</span>
              )}
            </td>
          </tr>
        </tbody>
      </table>
    </>
  )
}

/** Out-of-range values are highlighted (color + icon); offline sensors show "Offline" (07 §8.3). */
function SensorCell({ value, digits }: { value: SensorValue; digits: number }) {
  const { t } = useTranslation()
  if (value.value === null || value.quality === 'offline' || value.quality === 'no_data') {
    return (
      <td className="num">
        <span className="status-text st--offline">{t(`quality.${value.quality === 'no_data' ? 'no_data' : 'offline'}`)}</span>
      </td>
    )
  }
  return (
    <td className={cx('num', value.severity !== 'normal' && `val-${value.severity}`)}>
      {formatNumber(value.value, digits)}
      {value.quality === 'delayed' && value.measuredAt && (
        <>
          {' '}
          <span className="value-delayed">
            {t('quality.delayed')} · {formatRecentTime(value.measuredAt)}
          </span>
        </>
      )}
    </td>
  )
}

/** "DO ≥ 5.0 · pH 7.5–8.5 · Temp 26.5–30.5 · TDS 16,000–24,000 · …" */
function formatRanges(ranges: ParameterRange[], t: (key: string) => string): string {
  return ranges
    .map((r) => {
      const f = (n: number) => formatNumber(n, DIGITS[r.parameter])
      const label = t(`param.${r.parameter}`)
      if (r.normalMin != null && r.normalMax != null) return `${label} ${f(r.normalMin)}–${f(r.normalMax)}`
      if (r.normalMin != null) return `${label} ≥ ${f(r.normalMin)}`
      if (r.normalMax != null) return `${label} ≤ ${f(r.normalMax)}`
      return label
    })
    .join(' · ')
}

// ── 2. Active Alerts (TM-D-002) ──

function ActiveAlertsCard({ farmId }: { farmId: string }) {
  const { t } = useTranslation()
  const query = useOpenAlerts(farmId)
  const items = query.data?.items ?? []
  const unack = items.filter((a) => a.state === 'unacknowledged').length
  return (
    <Card
      title={t('tmDashboard.activeAlerts')}
      sub={query.data && t('tmDashboard.activeAlertsSub', { open: items.length, unack })}
    >
      <QueryState query={query}>
        {(data) =>
          data.items.length === 0 ? (
            <div className="empty">
              <span className="empty-title">{t('tmDashboard.noActiveAlerts')}</span>
            </div>
          ) : (
            <div className="alert-list">
              {sortAlerts(data.items).map((alert) => (
                <AlertRow key={alert.id} alert={alert} />
              ))}
            </div>
          )
        }
      </QueryState>
    </Card>
  )
}

/** Most severe first, then newest. */
function sortAlerts(alerts: Alert[]): Alert[] {
  return [...alerts].sort((a, b) => rank(a.severity) - rank(b.severity) || b.occurredAt.localeCompare(a.occurredAt))
}

function AlertRow({ alert }: { alert: Alert }) {
  const { t } = useTranslation()
  const to = `/tm/ponds/${alert.pond.id}?tab=alerts`
  return (
    <div className="alert-row">
      <span className={cx('alert-bar', `alert-bar--${alert.severity}`)} />
      <div>
        <div className="alert-title">{alert.title}</div>
        <div className="alert-meta">
          <span>
            <Icon icon={Waves} />
            {alert.pond.name}
          </span>
          <span>
            <Icon icon={Clock} />
            {formatRecentTime(alert.occurredAt)}
          </span>
          <span>{alert.id}</span>
        </div>
      </div>
      <div className="alert-side">
        <StatusMark severity={alert.severity} />
        <AlertStateText state={alert.state} />
      </div>
      {/* Acknowledge happens in the Pond Detail alert drawer, after checking the sensor data (prototype flow). */}
      {alert.state === 'unacknowledged' ? (
        <Link className="btn btn--primary btn--sm" to={`${to}&alert=${alert.id}`}>
          {t('tmDashboard.acknowledge')}
        </Link>
      ) : (
        <Link className="btn btn--link btn--sm" to={to}>
          {t('common.view')}
        </Link>
      )}
    </div>
  )
}

// ── 3. Operational Status (TM-D-004) ──

function OperationalStatusCard({ farmId }: { farmId: string }) {
  const { t } = useTranslation()
  const query = useOperationalStatus(farmId)
  return (
    <Card title={t('tmDashboard.operationalStatus')}>
      <QueryState query={query}>{(data) => <OperationalTable data={data} />}</QueryState>
    </Card>
  )
}

function OperationalTable({ data }: { data: OperationalStatus }) {
  const { t } = useTranslation()
  const rows: [LucideIcon, string, string][] = [
    [Fan, t('tmDashboard.aerators'), `${data.aerators.on} / ${data.aerators.total}`],
    [Droplets, t('tmDashboard.pumps'), `${data.pumps.on} / ${data.pumps.total}`],
    [Radio, t('tmDashboard.sensors'), `${data.sensors.online} / ${data.sensors.total}`],
    [Utensils, t('tmDashboard.feeding'), t('tmDashboard.rounds', { done: data.feedingToday.roundsDone, planned: data.feedingToday.roundsPlanned })],
    [Scale, t('tmDashboard.nextSampling'), data.nextSampling ? formatCalendarDate(data.nextSampling) : t('tmDashboard.none')],
    [Zap, t('tmDashboard.generator'), t(`tmDashboard.generatorState.${data.generator.state}`)],
  ]
  return (
    <table className="table table-compact">
      <tbody>
        {rows.map(([icon, label, value]) => (
          <tr key={label}>
            <td>
              <span className="row">
                <Icon icon={icon} className="text-muted" />
                {label}
              </span>
            </td>
            <td className="num strong">{value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

// ── 4. Report Status (TM-D-005) ──

function ReportStatusCard({ farmId }: { farmId: string }) {
  const { t } = useTranslation()
  const query = useReportStatus(farmId)
  return (
    <Card title={t('tmDashboard.reportStatus')}>
      <QueryState query={query}>{(data) => <ReportStatusBody data={data} />}</QueryState>
    </Card>
  )
}

function ReportStatusBody({ data }: { data: ReportStatusSummary }) {
  const { t } = useTranslation()
  const daily = data.dailyToday
  const weekly = data.weeklyThisWeek
  const last = data.lastSubmitted
  return (
    // No dividers between the reports — spacing only (wireframe)
    <div className="card-body stack" style={{ gap: 'var(--space-4)' }}>
      <ReportStatusRow
        item={daily}
        title={t('tmDashboard.dailyReport', { date: daily.date ? formatCalendarDate(daily.date) : '' })}
        to="/tm/reports/daily"
        primary
      />
      <ReportStatusRow
        item={weekly}
        title={t('tmDashboard.weeklyReport', {
          period: weekly.weekStart && weekly.weekEnd ? formatWeek(weekly.weekStart, weekly.weekEnd) : '',
        })}
        to="/tm/reports/weekly"
      />
      <div className="row-between">
        <span className="text-secondary small">{t('tmDashboard.lastSubmitted')}</span>
        <span className="small">
          {last?.submittedAt ? `${t(`reportType.${last.type}`)} · ${formatRecentTime(last.submittedAt)}` : t('tmDashboard.none')}
        </span>
      </div>
    </div>
  )
}

function ReportStatusRow({ item, title, to, primary }: { item: ReportStatusItem; title: string; to: string; primary?: boolean }) {
  const { t } = useTranslation()
  const caption = [
    item.state !== 'submitted' && t('tmDashboard.due', { due: formatDue(item.dueAt) }),
    item.savedAt && item.state === 'draft' && t('tmDashboard.lastSaved', { time: formatRecentTime(item.savedAt) }),
  ]
    .filter(Boolean)
    .join(' · ')
  const action = item.state === 'not_started' ? t('tmDashboard.create') : item.state === 'submitted' ? t('common.view') : t('tmDashboard.continue')
  return (
    <div className="stack" style={{ gap: 8 }}>
      <div className="row-between">
        <span className="strong">{title}</span>
        <ReportStateText state={item.state} />
      </div>
      {caption && <span className="caption">{caption}</span>}
      <div>
        <Link className={cx('btn btn--sm', primary ? 'btn--primary' : 'btn--outline')} to={to}>
          {action}
        </Link>
      </div>
    </div>
  )
}
