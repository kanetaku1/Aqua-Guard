import { format } from 'date-fns'
import { TZDate } from '@date-fns/tz'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router'
import { RANGE, useAnomalies, useCurrentSensors, useSensorHistory, useSensorSeries, type SeriesRange } from '@/api/queries/pond'
import type { SensorParameter } from '@/api/types'
import type { components } from '@/api/schema'
import { TimeSeriesChart } from '@/components/Charts'
import { Pagination, Segmented } from '@/components/Controls'
import { DateField } from '@/components/DateField'
import { Icon } from '@/components/Icon'
import { Card } from '@/components/Page'
import { QueryState } from '@/components/QueryState'
import { StatusMark } from '@/components/StatusMark'
import { niceDomain } from '@/lib/chartTheme'
import { now } from '@/lib/clock'
import { cx } from '@/lib/cx'
import { WIB, formatCalendarDate, formatDayTime, formatDuration, formatLimit, formatNumber, formatRecentTime, todayInWib, wibDayRange } from '@/lib/format'
import { DIGITS, PARAM_ICON, SENSOR_PARAMS, UNIT, isSensorParameter, warningRange } from '@/lib/params'

type S = components['schemas']
const RANGES: SeriesRange[] = ['24h', '7d', '30d']
const HISTORY_PAGE_SIZE = 6
const DAY_MS = 24 * 60 * 60 * 1000

/** IoT / Water Quality (TM-PD-001〜005): current values, time series, anomalies, raw history. */
export function IotTab({ pondId }: { pondId: string }) {
  const [params, setParams] = useSearchParams()
  const current = useCurrentSensors(pondId)
  const range: SeriesRange = RANGES.includes(params.get('range') as SeriesRange) ? (params.get('range') as SeriesRange) : '24h'
  // Default: the most severe parameter (what the TM most likely came to look at), else DO
  const worst = current.data?.items.find((i) => i.severity !== 'normal')?.parameter ?? 'do'
  const param = isSensorParameter(params.get('param')) ? (params.get('param') as SensorParameter) : worst

  const set = (key: string, value: string) =>
    setParams(
      (p) => {
        p.set(key, value)
        return p
      },
      { replace: true },
    )

  return (
    <div className="stack" style={{ gap: 24 }}>
      <QueryState query={current}>
        {(data) => (
          <div className="grid cols-3 gap-4">
            {data.items.map((reading) => (
              <SensorTile key={reading.parameter} reading={reading} selected={reading.parameter === param} onSelect={() => set('param', reading.parameter)} />
            ))}
          </div>
        )}
      </QueryState>

      <div className="grid cols-8-4">
        <SeriesCard
          pondId={pondId}
          param={param}
          range={range}
          threshold={current.data?.items.find((i) => i.parameter === param)?.threshold}
          onParam={(p) => set('param', p)}
          onRange={(r) => set('range', r)}
        />
        <AnomaliesCard pondId={pondId} />
      </div>

      <HistoryCard pondId={pondId} />
    </div>
  )
}

function SensorTile({ reading, selected, onSelect }: { reading: S['SensorReading']; selected: boolean; onSelect: () => void }) {
  const { t } = useTranslation()
  const offline = reading.quality === 'offline' || reading.quality === 'no_data'
  return (
    <div
      className={cx('sensor', selected && 'is-selected')}
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      aria-label={t('iot.showSeries', { param: t(`param.${reading.parameter}`) })}
      onClick={onSelect}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onSelect())}
    >
      <div className="row-between">
        <span className="kpi-name row" style={{ gap: 6 }}>
          <Icon icon={PARAM_ICON[reading.parameter]} />
          {t(`param.${reading.parameter}`)}
        </span>
        {offline ? (
          <span className="status-text st--offline">{t(`quality.${reading.quality}`)}</span>
        ) : (
          <StatusMark severity={reading.severity} />
        )}
      </div>
      <div className="sensor-value">
        {reading.value === null ? '—' : formatNumber(reading.value, DIGITS[reading.parameter])}
        {UNIT[reading.parameter] && <small>{UNIT[reading.parameter]}</small>}
      </div>
      <div className="sensor-foot">
        <span>{t('iot.range', { range: warningRange(reading.threshold) })}</span>
        <span className="row" style={{ gap: 4 }}>
          <span className={cx('dot', offline ? 'dot--critical' : reading.quality === 'delayed' ? 'dot--attention' : 'dot--normal')} />
          {offline ? t('iot.offline') : reading.quality === 'delayed' ? t('quality.delayed') : t('iot.online')}
        </span>
      </div>
    </div>
  )
}

const LABEL_FORMAT: Record<SeriesRange, string> = { '24h': 'HH:mm', '7d': 'd MMM HH:mm', '30d': 'd MMM' }

function SeriesCard({
  pondId,
  param,
  range,
  threshold,
  onParam,
  onRange,
}: {
  pondId: string
  param: SensorParameter
  range: SeriesRange
  threshold: S['Threshold'] | undefined
  onParam: (p: SensorParameter) => void
  onRange: (r: SeriesRange) => void
}) {
  const { t } = useTranslation()
  const reference = useMemo(() => now(), [])
  const series = useSensorSeries(pondId, param, range, reference)
  const unit = UNIT[param]
  const low = threshold?.warningLow ?? null
  const high = threshold?.warningHigh ?? null

  return (
    <Card
      title={t('iot.seriesTitle', { param: t(`param.${param}`) })}
      sub={t(`iot.seriesSub.${RANGE[range].interval}`)}
      action={
        <div className="row" style={{ gap: 16 }}>
          <select
            className="select"
            style={{ width: 150, height: 32, fontSize: 14 }}
            aria-label={t('iot.parameter')}
            value={param}
            onChange={(e) => onParam(e.target.value as SensorParameter)}
          >
            {SENSOR_PARAMS.map((p) => (
              <option key={p} value={p}>
                {t(`paramName.${p}`)}
              </option>
            ))}
          </select>
          <Segmented label={t('iot.period')} value={range} onChange={onRange} options={RANGES.map((r) => ({ key: r, label: r }))} />
        </div>
      }
    >
      <div className="card-body">
        <div className="chart-legend" style={{ marginBottom: 12 }}>
          <span>
            <i className="legend-line" />
            {t(`param.${param}`)}
            {unit && ` (${unit})`}
          </span>
          {(low !== null || high !== null) && (
            <span>
              <i className="legend-band" />
              {low !== null && high !== null
                ? t('iot.outsideThreshold', { range: `${formatLimit(low)}–${formatLimit(high)}` })
                : low !== null
                  ? t('iot.belowThreshold', { value: formatLimit(low) })
                  : t('iot.aboveThreshold', { value: formatLimit(high!) })}
            </span>
          )}
        </div>
        <QueryState query={series}>
          {(data) => {
            const values = data.points.map((p) => p.avg).filter((v): v is number => v !== null)
            const domain = niceDomain([...values, ...[low, high].filter((v): v is number => v !== null)])
            return (
              <TimeSeriesChart
                unit={unit}
                digits={DIGITS[param]}
                domain={domain}
                data={data.points.map((p) => ({ label: format(new TZDate(new Date(p.t).getTime(), WIB), LABEL_FORMAT[range]), value: p.avg ?? null }))}
                bands={[...(low !== null ? [[domain[0], low] as [number, number]] : []), ...(high !== null ? [[high, domain[1]] as [number, number]] : [])]}
                thresholds={[low, high].filter((v): v is number => v !== null).map((v) => ({ value: v, label: formatLimit(v) }))}
              />
            )
          }}
        </QueryState>
      </div>
    </Card>
  )
}

function AnomaliesCard({ pondId }: { pondId: string }) {
  const { t } = useTranslation()
  const anomalies = useAnomalies(pondId)
  return (
    <Card title={t('iot.anomalies')}>
      <QueryState query={anomalies}>
        {(data) =>
          data.items.length === 0 ? (
            <div className="empty">
              <span className="empty-title">{t('iot.noAnomalies')}</span>
            </div>
          ) : (
            <div className="alert-list">
              {data.items.map((a) => (
                <div key={`${a.kind}-${a.parameter}`} className="alert-row" style={{ gridTemplateColumns: '4px 1fr' }}>
                  <span className={cx('alert-bar', `alert-bar--${a.severity}`)} />
                  <div>
                    <div className="alert-title">{t(`iot.anomaly.${a.kind}`, { param: t(`paramName.${a.parameter}`) })}</div>
                    <div className="alert-meta">
                      {anomalyFacts(a, t).map((f) => (
                        <span key={f}>{f}</span>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )
        }
      </QueryState>
    </Card>
  )
}

/**
 * "Since 07:50 · Min 4.1 mg/L" for threshold breaches; trends: "2 days · −1.3 mg/L vs 27 Sep avg." or
 * "+0.6 °C / 24h · within range" (the duration is left out when it is no longer than the 24h window).
 */
function anomalyFacts(a: S['SensorAnomaly'], t: (key: string, o?: Record<string, unknown>) => string): string[] {
  const digits = DIGITS[a.parameter]
  const unit = a.unit ? ` ${a.unit}` : ''
  if (a.kind === 'below_threshold' || a.kind === 'above_threshold') {
    const facts = [t('iot.since', { time: formatRecentTime(a.startedAt) })]
    if (a.extremeValue !== null) {
      facts.push(t(a.kind === 'below_threshold' ? 'iot.min' : 'iot.max', { value: `${formatNumber(a.extremeValue, digits)}${unit}` }))
    }
    return facts
  }
  const facts = now().getTime() - new Date(a.startedAt).getTime() > DAY_MS ? [formatDuration(a.startedAt)] : []
  if (a.change24h !== null) {
    const sign = a.change24h > 0 ? '+' : a.change24h < 0 ? '−' : ''
    const value = `${sign}${formatNumber(Math.abs(a.change24h), digits)}${unit}`
    facts.push(a.comparedWith ? t('iot.vsDayAvg', { value, date: formatCalendarDate(a.comparedWith) }) : t('iot.per24h', { value }))
  }
  if (a.withinRange) facts.push(t('iot.withinRange'))
  return facts
}

function HistoryCard({ pondId }: { pondId: string }) {
  const { t } = useTranslation()
  const [date, setDate] = useState(todayInWib())
  const [page, setPage] = useState(1)
  const [from, to] = wibDayRange(date)
  const history = useSensorHistory(pondId, from, to, page, HISTORY_PAGE_SIZE)

  return (
    <Card
      title={t('iot.history')}
      sub={t('iot.historySub')}
      action={
        <span style={{ width: 200, display: 'block' }}>
          <DateField
            value={date}
            onChange={(d) => {
              setDate(d)
              setPage(1)
            }}
          />
        </span>
      }
    >
      <QueryState query={history}>
        {(data) => (
          <>
            <table className="table table-compact">
              <thead>
                <tr>
                  <th>{t('iot.timestamp')}</th>
                  {SENSOR_PARAMS.map((p) => (
                    <th key={p} className="num">
                      {[t(`param.${p}`), UNIT[p]].filter(Boolean).join(' ')}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.items.map((row) => (
                  <tr key={row.measuredAt}>
                    <td>{formatDayTime(row.measuredAt)}</td>
                    {SENSOR_PARAMS.map((p) => {
                      const v = row.values[p]
                      return (
                        <td key={p} className={cx('num', v.severity !== 'normal' && `val-${v.severity}`)}>
                          {v.value === null ? '—' : formatNumber(v.value, DIGITS[p])}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            {data.items.length === 0 && (
              <div className="empty">
                <span className="empty-title">{t('iot.noReadings')}</span>
              </div>
            )}
            <div className="card-footer" style={{ justifyContent: 'space-between' }}>
              <span className="caption" style={{ alignSelf: 'center' }}>
                {t('iot.showing', { shown: data.items.length, total: data.total })}
              </span>
              <Pagination page={data.page} pageCount={Math.ceil(data.total / data.pageSize)} onChange={setPage} />
            </div>
          </>
        )}
      </QueryState>
    </Card>
  )
}
