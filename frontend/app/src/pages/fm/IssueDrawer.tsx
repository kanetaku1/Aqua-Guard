import { Info, TrendingDown, TrendingUp } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { useIssue } from '@/api/queries/farms'
import { Drawer } from '@/components/Drawer'
import { Icon } from '@/components/Icon'
import { AlertStateText, StatusMark } from '@/components/StatusMark'
import { formatDateTime, formatDayTime, formatDuration } from '@/lib/format'
import { issueTitle } from './farmUtils'

/**
 * Alert Detail for the Farms Manager (FM-FD-009/010) — read only. Aggregated trend in words, the TM's actions and
 * optional report context. No raw time series (02 `**`); handling is done by the Technical Manager.
 */
export function IssueDrawer({ issueId, onClose }: { issueId: string; onClose: () => void }) {
  const { t } = useTranslation()
  const query = useIssue(issueId)
  const i = query.data
  if (!i) {
    return query.isError ? (
      <Drawer title={issueId} onClose={onClose}>
        <div className="notice notice--warning" role="alert">
          <span>{t('alertDrawer.loadFailed')}</span>
        </div>
      </Drawer>
    ) : null
  }
  return (
    <Drawer
      caption={`${i.id} · ${i.farm.name}`}
      title={issueTitle(i, t)}
      onClose={onClose}
      footer={
        <button type="button" className="btn btn--outline" onClick={onClose}>
          {t('common.close')}
        </button>
      }
    >
      <div className="row">
        <StatusMark severity={i.severity} />
        <AlertStateText state={i.handling} />
        <span className={`status-text ${i.state === 'ongoing' ? 'st--progress' : 'st--resolved'}`}>{t(`fm.issueState.${i.state}`)}</span>
      </div>
      <dl className="dl dl-2">
        <div>
          <dt>{t('fm.drawer.type')}</dt>
          <dd>{t(`issueType.${i.issueType}`)}</dd>
        </div>
        <div>
          <dt>{t('fm.drawer.pond')}</dt>
          <dd>{i.pond.name}</dd>
        </div>
        <div>
          <dt>{t('fm.drawer.occurrence')}</dt>
          <dd>{formatDateTime(i.since)}</dd>
        </div>
        <div>
          <dt>{t('alertDrawer.duration')}</dt>
          <dd>{t(i.state === 'ongoing' ? 'fm.drawer.ongoing' : 'fm.drawer.resolved', { duration: formatDuration(i.since, i.resolvedAt ?? undefined) })}</dd>
        </div>
        <div>
          <dt>{t('weekly.ponds.trend')}</dt>
          <dd>
            <span className="trend">
              <Icon icon={i.trend === 'decreasing' ? TrendingDown : TrendingUp} />
              {i.trendDescription}
            </span>
          </dd>
        </div>
        <div>
          <dt>{t('pondAlerts.handledBy')}</dt>
          <dd>{i.handledBy ? t('fm.drawer.handledBy', { name: i.handledBy.name }) : '—'}</dd>
        </div>
      </dl>
      <hr className="divider" />
      <div>
        <div className="subsection-title">{t('fm.drawer.summary')}</div>
        <p className="prose">{i.summary}</p>
      </div>
      <div>
        <div className="subsection-title">{t('fm.drawer.actions')}</div>
        {i.actions.length === 0 ? (
          <span className="caption">{t('alertDrawer.noActions')}</span>
        ) : (
          <table className="table table-compact">
            <tbody>
              {i.actions.map((a) => (
                <tr key={a.id}>
                  <td className="text-muted">{formatDayTime(a.performedAt)}</td>
                  <td className="wrap">{t(`actionType.${a.type}`)}</td>
                  <td className="wrap text-secondary">{a.note ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {i.relatedReports.length > 0 && (
        <div>
          <div className="subsection-title">{t('fm.drawer.reports')}</div>
          {i.relatedReports.map((r) => (
            <div key={r.id}>
              <Link to={`/fm/reports/${r.type}/${r.id}`}>{r.label}</Link> <span className="caption">{t('fm.drawer.reportNote')}</span>
            </div>
          ))}
        </div>
      )}
      <div className="notice">
        <Icon icon={Info} />
        <span>{t('fm.drawer.readOnly')}</span>
      </div>
    </Drawer>
  )
}
