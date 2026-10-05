import { format } from 'date-fns'
import { TZDate } from '@date-fns/tz'
import { ArrowRight, Plus, TriangleAlert } from 'lucide-react'
import { useMemo, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { useAlert, useAlertMutations, useSensorSeries } from '@/api/queries/pond'
import type { components } from '@/api/schema'
import type { SensorParameter } from '@/api/types'
import { TimeSeriesChart } from '@/components/Charts'
import { Drawer } from '@/components/Drawer'
import { Icon } from '@/components/Icon'
import { QueryState } from '@/components/QueryState'
import { AlertStateText, StatusMark } from '@/components/StatusMark'
import { niceDomain } from '@/lib/chartTheme'
import { now } from '@/lib/clock'
import { cx } from '@/lib/cx'
import { WIB, formatDateTime, formatDuration, formatLimit, formatNumber, formatRecentTime, todayInWib, wibDateTimeToIso } from '@/lib/format'
import { DIGITS, isSensorParameter } from '@/lib/params'

type AlertDetail = components['schemas']['AlertDetail']
type ActionType = components['schemas']['ActionType']
const ACTION_TYPES: ActionType[] = ['increased_aeration', 'water_exchange', 'equipment_inspection', 'water_treatment', 'other']
const STEPS = ['acknowledge', 'review', 'record', 'resolve'] as const

/**
 * Alert Detail drawer (TM-PD-007 / 008 / 022 / 023): acknowledge → review the sensor data → record actions → resolve.
 * Recorded actions flow into the day's Daily Report (Actions Taken).
 */
export function AlertDrawer({ pondId, alertId, onClose }: { pondId: string; alertId: string; onClose: () => void }) {
  const { t } = useTranslation()
  const alert = useAlert(alertId)
  if (alert.data) return <AlertDrawerBody key={alert.data.id} pondId={pondId} alert={alert.data} onClose={onClose} />
  if (!alert.isError) return null
  return (
    <Drawer title={alertId} onClose={onClose}>
      <div className="notice notice--warning" role="alert">
        <Icon icon={TriangleAlert} />
        <span>{t('alertDrawer.loadFailed')}</span>
      </div>
    </Drawer>
  )
}

function AlertDrawerBody({ pondId, alert, onClose }: { pondId: string; alert: AlertDetail; onClose: () => void }) {
  const { t } = useTranslation()
  const { acknowledge, recordAction, resolve } = useAlertMutations(pondId, alert.id)
  const resolved = alert.state === 'resolved'
  const unack = alert.state === 'unacknowledged'
  const param = isSensorParameter(alert.parameter) ? alert.parameter : null

  // Workflow step: done before the current one
  const current = unack ? 0 : alert.state === 'acknowledged' ? 1 : alert.state === 'in_progress' ? 3 : 4

  const busy = acknowledge.isPending || resolve.isPending
  const failed = acknowledge.isError || resolve.isError

  return (
    <Drawer
      caption={t('alertDrawer.caption', { id: alert.id, pond: alert.pond.name })}
      title={alert.title}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn--outline" onClick={onClose}>
            {t('common.close')}
          </button>
          {!resolved && (
            <button
              type="button"
              className={cx('btn', unack ? 'btn--outline' : 'btn--primary')}
              disabled={unack || busy}
              onClick={() => resolve.mutate()}
            >
              {t('alertDrawer.resolve')}
            </button>
          )}
          {unack && (
            <button type="button" className="btn btn--primary" disabled={busy} onClick={() => acknowledge.mutate()}>
              {t('alertDrawer.acknowledge')}
            </button>
          )}
        </>
      }
    >
      <ol className="steps">
        {STEPS.map((s, i) => (
          <li key={s} className={cx(i < current && 'is-done', i === current && 'is-current')}>
            {t(`alertDrawer.steps.${s}`)}
          </li>
        ))}
      </ol>
      <div className="row">
        <StatusMark severity={alert.severity} />
        <AlertStateText state={alert.state} />
      </div>
      {failed && (
        <div className="notice notice--warning" role="alert">
          <Icon icon={TriangleAlert} />
          <span>{t('alertDrawer.failed')}</span>
        </div>
      )}
      <dl className="dl dl-2">
        <div>
          <dt>{t('alertDrawer.parameter')}</dt>
          <dd>{param ? t(`param.${param}`) : t('alertDrawer.sensorStatus')}</dd>
        </div>
        <div>
          <dt>{t('alertDrawer.valueThreshold')}</dt>
          <dd>{valueThreshold(alert)}</dd>
        </div>
        <div>
          <dt>{t('alertDrawer.occurred')}</dt>
          <dd>{formatDateTime(alert.occurredAt)}</dd>
        </div>
        <div>
          <dt>{t('alertDrawer.duration')}</dt>
          <dd>
            {formatDuration(alert.occurredAt, alert.resolvedAt ?? now())} ·{' '}
            {resolved ? t('alertDrawer.resolved') : t('alertDrawer.ongoing')}
          </dd>
        </div>
        <div>
          <dt>{t('alertDrawer.sensor')}</dt>
          <dd>{alert.sensor ? `${alert.sensor.deviceId} · ${t(`iot.${alert.sensor.connection}`)}` : '—'}</dd>
        </div>
        <div>
          <dt>{t('alertDrawer.related')}</dt>
          <dd>{alert.issueId ? t('alertDrawer.farmIssue', { id: alert.issueId }) : '—'}</dd>
        </div>
      </dl>

      {param && (
        <>
          <RecentChart pondId={pondId} param={param} threshold={alert.thresholdValue} />
          <Link className="btn btn--link" to={`?tab=iot&param=${param}`} style={{ alignSelf: 'flex-start' }}>
            {t('alertDrawer.openSeries', { param: t(`param.${param}`) })}
            <Icon icon={ArrowRight} />
          </Link>
        </>
      )}
      <hr className="divider" />

      <div className="stack" style={{ gap: 8 }}>
        <div className="subsection-title" style={{ margin: 0 }}>
          {t('alertDrawer.actions')}
        </div>
        {alert.actions.length === 0 ? (
          <span className="caption">{t('alertDrawer.noActions')}</span>
        ) : (
          <table className="table table-compact">
            <tbody>
              {alert.actions.map((a) => (
                <tr key={a.id}>
                  <td className="text-muted">{formatRecentTime(a.performedAt)}</td>
                  <td className="wrap">
                    {t(`actionType.${a.type}`)}
                    {a.note && ` — ${a.note}`}
                  </td>
                  <td>
                    <span className="source-tag">{t(`alertDrawer.source.${a.source}`)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {!resolved && <RecordActionForm onSubmit={(body, done) => recordAction.mutate(body, { onSuccess: done })} pending={recordAction.isPending} failed={recordAction.isError} />}
    </Drawer>
  )
}

/** "4.1 mg/L / ≥ 4.5" — the value and the Normal side of the threshold it crossed. */
function valueThreshold(a: AlertDetail): string {
  if (a.value === null || a.thresholdValue === null) return '—'
  const digits = isSensorParameter(a.parameter) ? DIGITS[a.parameter] : 1
  const unit = a.unit ? ` ${a.unit}` : ''
  const side = a.direction === 'below' ? '≥' : '≤'
  return `${formatNumber(a.value, digits)}${unit} / ${side} ${formatLimit(a.thresholdValue)}`
}

function RecentChart({ pondId, param, threshold }: { pondId: string; param: SensorParameter; threshold: number | null }) {
  const reference = useMemo(() => now(), [])
  const series = useSensorSeries(pondId, param, '24h', reference)
  return (
    <QueryState query={series}>
      {(data) => {
        const points = data.points.slice(-8)
        const values = points.map((p) => p.avg).filter((v): v is number => v !== null)
        const domain = niceDomain(threshold === null ? values : [...values, threshold])
        const low = data.threshold.warningLow ?? null
        const high = data.threshold.warningHigh ?? null
        return (
          <TimeSeriesChart
            height={160}
            unit={data.unit}
            digits={DIGITS[param]}
            domain={domain}
            data={points.map((p) => ({ label: format(new TZDate(new Date(p.t).getTime(), WIB), 'HH:mm'), value: p.avg ?? null }))}
            bands={[...(low !== null ? [[domain[0], low] as [number, number]] : []), ...(high !== null ? [[high, domain[1]] as [number, number]] : [])]}
            thresholds={[low, high].filter((v): v is number => v !== null).map((v) => ({ value: v, label: formatLimit(v) }))}
          />
        )
      }}
    </QueryState>
  )
}

function RecordActionForm({
  onSubmit,
  pending,
  failed,
}: {
  onSubmit: (body: components['schemas']['AlertActionInput'], done: () => void) => void
  pending: boolean
  failed: boolean
}) {
  const { t } = useTranslation()
  const [time, setTime] = useState(() => format(new TZDate(now().getTime(), WIB), 'HH:mm'))
  const [type, setType] = useState<ActionType | ''>('')
  const [note, setNote] = useState('')
  const [tried, setTried] = useState(false)
  const timeOk = /^([01]\d|2[0-3]):[0-5]\d$/.test(time)

  const submit = (e: FormEvent) => {
    e.preventDefault()
    setTried(true)
    if (!timeOk || !type) return
    onSubmit({ performedAt: wibDateTimeToIso(todayInWib(), time), type, note: note.trim() || undefined }, () => {
      setType('')
      setNote('')
      setTried(false)
    })
  }

  return (
    <form className="stack" onSubmit={submit} noValidate>
      <div className="form-grid">
        <label className="field">
          <span className="field-label">{t('alertDrawer.time')}</span>
          <input className={cx('input', tried && !timeOk && 'is-error')} value={time} onChange={(e) => setTime(e.target.value)} placeholder="HH:mm" />
        </label>
        <label className="field">
          <span className="field-label">{t('alertDrawer.action')}</span>
          <select className="select" value={type} aria-invalid={(tried && !type) || undefined} onChange={(e) => setType(e.target.value as ActionType)}>
            <option value="">{t('alertDrawer.select')}</option>
            {ACTION_TYPES.map((a) => (
              <option key={a} value={a}>
                {t(`actionType.${a}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="field span-2">
          <span className="field-label">{t('alertDrawer.note')}</span>
          <input className="input" placeholder={t('alertDrawer.notePlaceholder')} value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
      </div>
      {tried && (!timeOk || !type) && <span className="helper is-error">{t('alertDrawer.fixForm')}</span>}
      {failed && <span className="helper is-error">{t('alertDrawer.recordFailed')}</span>}
      <button type="submit" className="btn btn--outline btn--sm" style={{ alignSelf: 'flex-start', flexShrink: 0 }} disabled={pending}>
        <Icon icon={Plus} />
        {t('alertDrawer.recordAction')}
      </button>
      <span className="helper">{t('alertDrawer.helper')}</span>
    </form>
  )
}
