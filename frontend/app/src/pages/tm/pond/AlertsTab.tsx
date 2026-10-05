import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { usePondAlerts } from '@/api/queries/pond'
import type { AlertState } from '@/api/types'
import type { components } from '@/api/schema'
import { Card } from '@/components/Page'
import { QueryState } from '@/components/QueryState'
import { AlertStateText, StatusMark } from '@/components/StatusMark'
import { formatDayTime } from '@/lib/format'

const STATES: AlertState[] = ['unacknowledged', 'acknowledged', 'in_progress', 'resolved']

/** Alerts (TM-PD-006〜009): every alert of the Pond, newest first. Detail and handling are in the drawer (`?alert=`). */
export function AlertsTab({ pond }: { pond: components['schemas']['PondDetail'] }) {
  const { t } = useTranslation()
  const alerts = usePondAlerts(pond.pond.id)
  const [state, setState] = useState<AlertState | ''>('')

  return (
    <Card
      title={t('pondAlerts.title')}
      sub={t('pondAlerts.sub', { pond: pond.pond.name, count: pond.openAlerts })}
      action={
        <select
          className="select"
          style={{ width: 180, height: 32, fontSize: 14 }}
          aria-label={t('pondAlerts.state')}
          value={state}
          onChange={(e) => setState(e.target.value as AlertState | '')}
        >
          <option value="">{t('pondAlerts.stateAll')}</option>
          {STATES.map((s) => (
            <option key={s} value={s}>
              {t(`alertState.${s}`)}
            </option>
          ))}
        </select>
      }
    >
      <QueryState query={alerts}>
        {(data) => {
          const rows = data.items
            .filter((a) => !state || a.state === state)
            .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
          return (
            <>
              <table className="table">
                <thead>
                  <tr>
                    <th>{t('pondAlerts.id')}</th>
                    <th>{t('pondAlerts.alert')}</th>
                    <th>{t('pondAlerts.severity')}</th>
                    <th>{t('pondAlerts.occurred')}</th>
                    <th>{t('pondAlerts.state')}</th>
                    <th>{t('pondAlerts.handledBy')}</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((a) => (
                    <tr key={a.id}>
                      <td className="text-muted">{a.id}</td>
                      <td className="cell-main">{a.title}</td>
                      <td>
                        <StatusMark severity={a.severity} />
                      </td>
                      <td>{formatDayTime(a.occurredAt)}</td>
                      <td>
                        <AlertStateText state={a.state} />
                      </td>
                      <td className={a.handledBy ? undefined : 'text-muted'}>{a.handledBy?.name ?? '—'}</td>
                      <td className="actions">
                        <Link className="btn btn--link btn--sm" to={`?tab=alerts&alert=${a.id}`}>
                          {t('pondAlerts.detail')}
                        </Link>
                        {a.state === 'unacknowledged' && (
                          <Link className="btn btn--primary btn--sm" to={`?tab=alerts&alert=${a.id}`}>
                            {t('pondAlerts.acknowledge')}
                          </Link>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {rows.length === 0 && (
                <div className="empty">
                  <span className="empty-title">{t('pondAlerts.none')}</span>
                </div>
              )}
            </>
          )
        }}
      </QueryState>
    </Card>
  )
}
