import { useTranslation } from 'react-i18next'
import type { AlertState, ReportStatusItem, Severity } from '@/api/types'
import { cx } from '@/lib/cx'

/**
 * Severity of the row's subject (07 §8.2 / app.css "Badge vs Indicator"):
 * Normal → Status Indicator (dot + text); Attention / Warning / Critical → Status Badge.
 */
export function StatusMark({ severity, size }: { severity: Severity; size?: 'lg' | 'xs' }) {
  const { t } = useTranslation()
  const label = t(`severity.${severity}`)
  if (severity === 'normal') {
    return <span className={cx('status-text st--normal', size === 'lg' && 'status-text--lg')}>{label}</span>
  }
  return <span className={cx('badge', `badge--${severity}`, size && `badge--${size}`)}>{label}</span>
}

const ALERT_STATE_CLASS: Record<AlertState, string> = {
  unacknowledged: 'st--unack',
  acknowledged: 'st--ack',
  in_progress: 'st--progress',
  resolved: 'st--resolved',
}

/** Alert handling state as a Status Indicator. `count` prefixes the label ("1 Unacknowledged"). */
export function AlertStateText({ state, count }: { state: AlertState; count?: number }) {
  const { t } = useTranslation()
  const label = t(`alertState.${state}`)
  return <span className={cx('status-text', ALERT_STATE_CLASS[state])}>{count === undefined ? label : `${count} ${label}`}</span>
}

type ReportState = ReportStatusItem['state']

const REPORT_STATE_CLASS: Record<ReportState, string> = {
  not_started: 'st--neutral',
  draft: 'st--draft',
  submitted: 'st--submitted',
  overdue: 'st--critical',
}

export function ReportStateText({ state, size }: { state: ReportState; size?: 'lg' }) {
  const { t } = useTranslation()
  return <span className={cx('status-text', size === 'lg' && 'status-text--lg', REPORT_STATE_CLASS[state])}>{t(`reportState.${state}`)}</span>
}
