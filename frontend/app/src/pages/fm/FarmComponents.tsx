import { Clock, Warehouse, Waves } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router'
import type { FarmSummary, Issue } from '@/api/types'
import { Icon } from '@/components/Icon'
import { AlertStateText, StatusMark } from '@/components/StatusMark'
import { cx } from '@/lib/cx'
import { formatElapsed } from '@/lib/format'
import { issueTitle } from './farmUtils'

/** Shared by FM-01 Dashboard, FM-02 Farm List and FM-03 Farm Detail. */

/** One aspect (Water quality / Growth / Operations) as an Indicator: its status + the fact behind it. */
export function AspectText({ aspect }: { aspect: FarmSummary['waterQuality'] }) {
  return <span className={cx('status-text', `st--${aspect.status}`)}>{aspect.fact}</span>
}

/** Farm row: Farm (Ponds) | Status | Main reason | Water quality | Growth | Operations [| extra] | View */
export function FarmRow({ farm, location, extra }: { farm: FarmSummary; location?: boolean; extra?: ReactNode }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const to = `/fm/farms/${farm.id}`
  return (
    <tr className="is-link" onClick={() => navigate(to)}>
      <td className={cx(location && 'wrap')} style={location ? { minWidth: 160, maxWidth: 190 } : undefined}>
        <div className="cell-main">{farm.name}</div>
        <div className="cell-sub" style={location ? { whiteSpace: 'normal' } : undefined}>{location ? t('fm.farmSubLocation', { location: farm.location, count: farm.pondCount }) : t('fm.farmSub', { count: farm.pondCount })}</div>
      </td>
      <td>
        <StatusMark severity={farm.status} />
      </td>
      <td className="wrap" style={{ minWidth: 200, maxWidth: 260 }}>
        {farm.mainReason}
      </td>
      <td>
        <AspectText aspect={farm.waterQuality} />
      </td>
      <td>
        <AspectText aspect={farm.growth} />
      </td>
      <td>
        <AspectText aspect={farm.operations} />
      </td>
      {extra}
      <td className="actions">
        <Link className="btn btn--link" to={to} onClick={(e) => e.stopPropagation()}>
          {t('common.view')}
        </Link>
      </td>
    </tr>
  )
}

/** Risk / Issue row (FM, view only): severity bar · title · Farm / Pond / duration / ID · severity + handling · action. */
export function IssueRow({ issue, showFarm = true, action }: { issue: Issue; showFarm?: boolean; action: ReactNode }) {
  const { t } = useTranslation()
  return (
    <div className="alert-row">
      <span className={cx('alert-bar', `alert-bar--${issue.severity}`)} />
      <div>
        <div className="alert-title">{issueTitle(issue, t)}</div>
        <div className="alert-meta">
          {showFarm && (
            <span>
              <Icon icon={Warehouse} />
              {issue.farm.name}
            </span>
          )}
          <span>
            <Icon icon={Waves} />
            {issue.pond.name}
          </span>
          <span>
            <Icon icon={Clock} />
            {formatElapsed(issue.since, issue.resolvedAt ?? undefined)}
          </span>
          <span>{issue.id}</span>
        </div>
      </div>
      <div className="alert-side">
        <StatusMark severity={issue.severity} />
        <AlertStateText state={issue.handling} />
      </div>
      {action}
    </div>
  )
}
