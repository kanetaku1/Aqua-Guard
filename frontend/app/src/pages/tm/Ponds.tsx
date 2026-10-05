import { Scale, Search, Warehouse } from 'lucide-react'
import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { useCurrentUser } from '@/api/queries/auth'
import { useFarm, useOperationalStatus } from '@/api/queries/farms'
import { usePonds } from '@/api/queries/ponds'
import type { AlertState, PondListRow, Severity } from '@/api/types'
import { Icon } from '@/components/Icon'
import { Card, PageHeader } from '@/components/Page'
import { QueryState } from '@/components/QueryState'
import { AlertStateText, StatusMark } from '@/components/StatusMark'
import { Toast } from '@/components/Toast'
import { useDocumentTitle } from '@/components/useDocumentTitle'
import { cx } from '@/lib/cx'
import { formatCalendarDate, formatNumber, formatSignedPct } from '@/lib/format'
import { SamplingDrawer } from './SamplingDrawer'

const SEVERITIES: Severity[] = ['critical', 'warning', 'attention', 'normal']
const ALERT_FILTERS: (AlertState | 'none')[] = ['unacknowledged', 'acknowledged', 'in_progress', 'none']

/**
 * TM-02 Pond List (05 §5 / 06 TM-02 / prototype screens/tm-ponds.html): choose a Pond to manage.
 * Growth and today's records only — current water quality is on the Dashboard.
 * Filters live in the URL (`?q=&status=&alert=`); `?sampling=1` opens the weekly sampling drawer.
 */
export function TmPonds() {
  useDocumentTitle('TM-02 Pond List')
  const { t } = useTranslation()
  const me = useCurrentUser()
  const farmId = me.farm?.id ?? ''
  const farm = useFarm(farmId)
  const operational = useOperationalStatus(farmId)
  const ponds = usePonds(farmId)
  const [params, setParams] = useSearchParams()
  const [toast, setToast] = useState<string | null>(null)
  const clearToast = useCallback(() => setToast(null), [])

  const q = params.get('q') ?? ''
  const status = params.get('status') ?? ''
  const alert = params.get('alert') ?? ''

  const setParam = (key: string, value: string) =>
    setParams(
      (p) => {
        if (value) p.set(key, value)
        else p.delete(key)
        return p
      },
      { replace: true },
    )
  // The drawer is a history entry, so Back closes it.
  const openSampling = () =>
    setParams((p) => {
      p.set('sampling', '1')
      return p
    })
  const closeSampling = useCallback(
    () =>
      setParams(
        (p) => {
          p.delete('sampling')
          return p
        },
        { replace: true },
      ),
    [setParams],
  )

  const nextSampling = operational.data?.nextSampling

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: t('nav.dashboard'), to: '/tm/dashboard' }, { label: t('nav.ponds') }]}
        title={t('tmPonds.title')}
        meta={
          <>
            {farm.data && (
              <span>
                <Icon icon={Warehouse} />
                {t('tmPonds.meta', { farm: farm.data.name, count: farm.data.pondCount })}
              </span>
            )}
            {nextSampling && (
              <span>
                <Icon icon={Scale} />
                {t('tmPonds.nextSampling', { date: formatCalendarDate(nextSampling) })}
              </span>
            )}
          </>
        }
        actions={
          <button type="button" className="btn btn--primary" onClick={openSampling}>
            <Icon icon={Scale} />
            {t('tmPonds.recordSampling')}
          </button>
        }
      />

      <div className="filter-bar">
        <div className="input-search">
          <Icon icon={Search} />
          <input className="input" placeholder={t('tmPonds.search')} aria-label={t('tmPonds.search')} value={q} onChange={(e) => setParam('q', e.target.value)} />
        </div>
        <select className="select" aria-label={t('tmPonds.status')} value={status} onChange={(e) => setParam('status', e.target.value)}>
          <option value="">{t('tmPonds.statusAll')}</option>
          {SEVERITIES.map((s) => (
            <option key={s} value={s}>
              {t(`severity.${s}`)}
            </option>
          ))}
        </select>
        <select className="select" aria-label={t('tmPonds.alerts')} value={alert} onChange={(e) => setParam('alert', e.target.value)}>
          <option value="">{t('tmPonds.alertAll')}</option>
          {ALERT_FILTERS.map((a) => (
            <option key={a} value={a}>
              {a === 'none' ? t('tmPonds.alertNone') : t(`alertState.${a}`)}
            </option>
          ))}
        </select>
      </div>

      <Card
        title={t('tmPonds.list')}
        sub={
          ponds.data &&
          (ponds.data.latestSamplingDate
            ? t('tmPonds.listSub', { date: formatCalendarDate(ponds.data.latestSamplingDate) })
            : t('tmPonds.listSubNoSampling'))
        }
      >
        <QueryState query={ponds}>
          {(data) => {
            const rows = filterPonds(data.items, { q, status, alert })
            return (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>{t('tmPonds.pond')}</th>
                      <th>{t('tmPonds.status')}</th>
                      <th>{t('tmPonds.alerts')}</th>
                      <th className="num">{t('tmPonds.abw')}</th>
                      <th>{t('tmPonds.vsTarget')}</th>
                      <th className="num">{t('tmPonds.feedToday')}</th>
                      <th className="num">{t('tmPonds.mortalityToday')}</th>
                      <th className="num">{t('tmPonds.aeratorsOn')}</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <PondRow key={row.pond.id} row={row} />
                    ))}
                  </tbody>
                </table>
                {rows.length === 0 && (
                  <div className="empty">
                    <span className="empty-title">{t('tmPonds.noMatch')}</span>
                    <button type="button" className="btn btn--link" onClick={() => setParams({}, { replace: true })}>
                      {t('common.clearFilters')}
                    </button>
                  </div>
                )}
              </div>
            )
          }}
        </QueryState>
      </Card>

      {params.has('sampling') && ponds.data && (
        <SamplingDrawer
          farmId={farmId}
          farmName={farm.data?.name ?? ''}
          ponds={ponds.data.items}
          initialDate={nextSampling ?? undefined}
          onClose={closeSampling}
          onSaved={(message) => {
            closeSampling()
            setToast(message)
          }}
        />
      )}
      {toast && <Toast message={toast} onDone={clearToast} />}
    </>
  )
}

/** Search by Pond name; Status = the Pond's severity; Alert = the worst open alert state (or none). */
function filterPonds(rows: PondListRow[], f: { q: string; status: string; alert: string }): PondListRow[] {
  const q = f.q.trim().toLowerCase()
  return [...rows]
    .filter((r) => !q || r.pond.name.toLowerCase().includes(q))
    .filter((r) => !f.status || r.status === f.status)
    .filter((r) => !f.alert || (f.alert === 'none' ? r.openAlerts === 0 : r.worstAlertState === f.alert))
    .sort((a, b) => a.pond.name.localeCompare(b.pond.name))
}

function PondRow({ row }: { row: PondListRow }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const to = `/tm/ponds/${row.pond.id}`
  return (
    <tr className="is-link" onClick={() => navigate(to)}>
      <td>
        <div className="cell-main">{row.pond.name}</div>
        <div className="cell-sub">
          {row.doc === null
            ? t('tmPonds.notStocked', { area: row.areaHa })
            : t('tmPonds.areaDoc', { area: row.areaHa, doc: row.doc })}
        </div>
      </td>
      <td>
        <StatusMark severity={row.status} />
      </td>
      <td>
        {row.openAlerts > 0 && row.worstAlertState ? (
          <AlertStateText state={row.worstAlertState} count={row.openAlerts} />
        ) : (
          <span className="text-muted">—</span>
        )}
      </td>
      <td className="num">{row.abwG === null ? '—' : `${formatNumber(row.abwG, 1)} g`}</td>
      <td>
        {row.vsTargetPct === null ? (
          <span className="text-muted">—</span>
        ) : (
          <span
            className={cx('status-text', row.growth === 'behind' ? 'st--attention' : 'st--normal')}
            title={row.growth ? t(`growth.${row.growth}`) : undefined}
          >
            {formatSignedPct(row.vsTargetPct)}
          </span>
        )}
      </td>
      <td className="num">
        {row.feedTodayKg === null ? (
          '—'
        ) : (
          <>
            {formatNumber(row.feedTodayKg)} kg{' '}
            <span className="caption">
              {row.feedRoundsToday} / {row.feedRoundsPlanned}
            </span>
          </>
        )}
      </td>
      <td className="num">{row.mortalityTodayPcs === null ? '—' : formatNumber(row.mortalityTodayPcs)}</td>
      <td className="num">
        {row.aerators.on} / {row.aerators.total}
      </td>
      <td className="actions">
        <Link className="btn btn--link" to={to} onClick={(e) => e.stopPropagation()}>
          {t('common.view')}
        </Link>
      </td>
    </tr>
  )
}
