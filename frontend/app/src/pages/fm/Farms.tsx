import { Search } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router'
import { useCurrentUser } from '@/api/queries/auth'
import { useFarms } from '@/api/queries/farms'
import type { FarmSummary, Severity } from '@/api/types'
import { Icon } from '@/components/Icon'
import { PageHeader } from '@/components/Page'
import { QueryState } from '@/components/QueryState'
import { useDocumentTitle } from '@/components/useDocumentTitle'
import { cx } from '@/lib/cx'
import { FarmRow } from './FarmComponents'
import { sortFarms } from './farmUtils'

const SEVERITIES: Severity[] = ['critical', 'warning', 'attention', 'normal']

/**
 * FM-02 Farm List (05 §4 / 06 FM-02 / prototype screens/fm-farms.html): choose a Farm.
 * Filters live in the URL (`?q=&status=&location=&issues=`). No detailed IoT values (05 FM-02).
 */
export function FmFarms() {
  useDocumentTitle('FM-02 Farm List')
  const { t } = useTranslation()
  const me = useCurrentUser()
  const farms = useFarms()
  const [params, setParams] = useSearchParams()
  const q = params.get('q') ?? ''
  const status = params.get('status') ?? ''
  const location = params.get('location') ?? ''
  const issues = params.get('issues') ?? ''

  const setParam = (key: string, value: string) =>
    setParams(
      (p) => {
        if (value) p.set(key, value)
        else p.delete(key)
        return p
      },
      { replace: true },
    )

  const filter = (list: FarmSummary[]) => {
    const needle = q.trim().toLowerCase()
    return sortFarms(list)
      .filter((f) => !needle || f.name.toLowerCase().includes(needle) || f.location.toLowerCase().includes(needle))
      .filter((f) => !status || f.status === status)
      .filter((f) => !location || f.location === location)
      .filter((f) => !issues || (issues === 'open' ? f.openIssues > 0 : f.openIssues === 0))
  }
  const locations = [...new Set(farms.data?.items.map((f) => f.location) ?? [])].sort()

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: t('nav.dashboard'), to: '/fm/dashboard' }, { label: t('nav.farms') }]}
        title={t('fm.farms.title')}
        meta={<span>{t('fm.farms.meta', { company: me.company })}</span>}
      />

      <div className="filter-bar">
        <div className="input-search">
          <Icon icon={Search} />
          <input className="input" placeholder={t('fm.farms.search')} aria-label={t('fm.farms.search')} value={q} onChange={(e) => setParam('q', e.target.value)} />
        </div>
        <select className="select" aria-label={t('fm.col.status')} value={status} onChange={(e) => setParam('status', e.target.value)}>
          <option value="">{t('tmPonds.statusAll')}</option>
          {SEVERITIES.map((s) => (
            <option key={s} value={s}>
              {t(`severity.${s}`)}
            </option>
          ))}
        </select>
        <select className="select" aria-label={t('fm.farms.location')} value={location} onChange={(e) => setParam('location', e.target.value)}>
          <option value="">{t('fm.farms.locationAll')}</option>
          {locations.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
        <select className="select" aria-label={t('fm.issues.title')} value={issues} onChange={(e) => setParam('issues', e.target.value)}>
          <option value="">{t('fm.farms.issuesAll')}</option>
          <option value="open">{t('fm.farms.issuesOpen')}</option>
          <option value="none">{t('fm.farms.issuesNone')}</option>
        </select>
      </div>

      <QueryState query={farms}>
        {(data) => {
          const rows = filter(data.items)
          return (
            <>
              <section className="card">
                <div className="status-summary">
                  {SEVERITIES.map((s) => (
                    <div key={s} className="status-count">
                      <span className={cx('status-text', `st--${s}`)}>{t(`severity.${s}`)}</span>
                      <div className="status-count-value">
                        {data.counts[s]}
                        <small>{t('fm.farm', { count: data.counts[s] })}</small>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <section className="card">
                <div className="card-header">
                  <div>
                    <h2 className="card-title">{t('fm.farms.list')}</h2>
                    <div className="card-sub">{t('fm.dashboard.meta', { farms: rows.length, ponds: rows.reduce((s, f) => s + f.pondCount, 0) })}</div>
                  </div>
                </div>
                <table className="table">
                  <thead>
                    <tr>
                      <th>{t('fm.col.farm')}</th>
                      <th>{t('fm.col.status')}</th>
                      <th>{t('fm.col.reason')}</th>
                      <th>{t('fm.col.water')}</th>
                      <th>{t('fm.col.growth')}</th>
                      <th>{t('fm.col.operations')}</th>
                      <th className="num">{t('fm.col.issues')}</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((f) => (
                      <FarmRow key={f.id} farm={f} location extra={<td className="num">{f.openIssues}</td>} />
                    ))}
                  </tbody>
                </table>
                {rows.length === 0 && (
                  <div className="empty">
                    <span className="empty-title">{t('fm.farms.noMatch')}</span>
                    <button type="button" className="btn btn--link" onClick={() => setParams({}, { replace: true })}>
                      {t('common.clearFilters')}
                    </button>
                  </div>
                )}
              </section>
            </>
          )
        }}
      </QueryState>
    </>
  )
}
