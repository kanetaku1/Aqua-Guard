import { Plus, Search } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useSearchParams } from 'react-router'
import { useAdminFarms } from '@/api/queries/admin'
import type { components } from '@/api/schema'
import { Icon } from '@/components/Icon'
import { PageHeader } from '@/components/Page'
import { QueryState } from '@/components/QueryState'
import { useDocumentTitle } from '@/components/useDocumentTitle'
import { cx } from '@/lib/cx'
import { formatNumber } from '@/lib/format'
import { AddFarmDrawer } from './AddFarmDrawer'

type S = components['schemas']
type FarmStatus = NonNullable<S['AdminFarm']['status']>
const STATUSES: FarmStatus[] = ['active', 'inactive']

/**
 * AD-02 Farm List (05 §5B AD-02, 06 AD-02, wireframe sa-farms-ponds.png): the Farm master and Add farm.
 * Master data only — no water quality, KPI or report status. Filters live in the URL (`?q= &status=`), `?addfarm=1` opens the drawer.
 */
export function AdFarms() {
  useDocumentTitle('AD-02 Farms & Ponds')
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const farms = useAdminFarms()
  const q = params.get('q') ?? ''
  const status = (STATUSES as string[]).includes(params.get('status') ?? '') ? (params.get('status') as FarmStatus) : null
  const adding = params.get('addfarm') === '1'

  const setParam = (key: string, value: string | null, replace = true) =>
    setParams(
      (p) => {
        if (value) p.set(key, value)
        else p.delete(key)
        return p
      },
      { replace },
    )

  const all = farms.data?.items ?? []
  const needle = q.trim().toLowerCase()
  const rows = all.filter((f) => (!needle || `${f.name} ${f.location}`.toLowerCase().includes(needle)) && (!status || f.status === status))
  const open = (id: string) => navigate(`/ad/farms/${id}`)

  return (
    <>
      <PageHeader
        title={t('adFarms.title')}
        meta={
          farms.data && (
            <span>
              {t('adFarms.meta', {
                farms: all.length,
                active: all.filter((f) => f.status === 'active').length,
                ponds: all.reduce((sum, f) => sum + f.pondCount, 0),
              })}
            </span>
          )
        }
        actions={
          <button type="button" className="btn btn--primary" onClick={() => setParam('addfarm', '1', false)}>
            <Icon icon={Plus} />
            {t('adFarms.add')}
          </button>
        }
      />

      <div className="filter-bar">
        <div className="input-search">
          <Icon icon={Search} />
          <input className="input" placeholder={t('adFarms.search')} aria-label={t('adFarms.search')} value={q} onChange={(e) => setParam('q', e.target.value)} />
        </div>
        <select className="select" aria-label={t('adFarms.col.status')} value={status ?? ''} onChange={(e) => setParam('status', e.target.value)}>
          <option value="">{t('adFarms.statusAll')}</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {t(`adFarms.status.${s}`)}
            </option>
          ))}
        </select>
      </div>

      <section className="card">
        <QueryState query={farms}>
          {() => (
            <>
              <table className="table">
                <thead>
                  <tr>
                    <th>{t('adFarms.col.farm')}</th>
                    <th>{t('adFarms.col.location')}</th>
                    <th className="num">{t('adFarms.col.ponds')}</th>
                    <th>{t('adFarms.col.tms')}</th>
                    <th>{t('adFarms.col.devices')}</th>
                    <th>{t('adFarms.col.status')}</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={7}>
                        <div className="empty">
                          <span className="empty-title">{t('adFarms.none')}</span>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    rows.map((f) => <FarmRow key={f.id} farm={f} onOpen={() => open(f.id)} />)
                  )}
                </tbody>
              </table>
              <div className="card-footer" style={{ justifyContent: 'flex-start' }}>
                <span className="caption">{t('adFarms.inactiveNote')}</span>
              </div>
            </>
          )}
        </QueryState>
      </section>

      {adding && <AddFarmDrawer onClose={() => setParam('addfarm', null)} onAdded={(id) => navigate(`/ad/farms/${id}`)} />}
    </>
  )
}

function FarmRow({ farm: f, onOpen }: { farm: S['AdminFarm']; onOpen: () => void }) {
  const { t } = useTranslation()
  const inactive = f.status === 'inactive'
  const [lead, ...others] = f.technicalManagers
  return (
    <tr className={cx('is-link', inactive && 'is-muted')} onClick={onOpen}>
      <td className="cell-main">{f.name}</td>
      <td>{f.location}</td>
      <td className="num">
        {f.pondCount}
        {f.pondsInOperation < f.pondCount && <span className="caption"> {t('adFarms.inOperation', { count: f.pondsInOperation })}</span>}
      </td>
      <td className={cx(!lead && 'text-muted')}>
        {lead ? (
          <>
            {lead.name}
            {lead.status === 'invited' && ` ${t('adFarms.invited')}`}
            {others.map((m) => (
              <div key={m.id} className="cell-sub">
                + {m.name}
                {m.status === 'invited' && ` ${t('adFarms.invited')}`}
              </div>
            ))}
          </>
        ) : (
          '—'
        )}
      </td>
      <td className={cx(f.devicesTotal === 0 && 'text-muted')}>
        {f.devicesTotal === 0 ? (
          t('adFarms.noDevices')
        ) : (
          // Some devices offline = Attention (as in TM / FM Operations); all online = Normal
          <span className={cx('status-text', f.devicesOnline < f.devicesTotal ? 'st--attention' : 'st--normal')}>
            {formatNumber(f.devicesOnline)} / {formatNumber(f.devicesTotal)}
          </span>
        )}
      </td>
      <td>
        <span className={cx('status-text', inactive ? 'st--neutral st--muted' : 'st--normal')}>{t(`adFarms.status.${f.status}`)}</span>
      </td>
      <td className="actions">
        <button
          type="button"
          className="btn btn--link"
          aria-label={t('adFarms.viewFarm', { name: f.name })}
          onClick={(e) => {
            e.stopPropagation()
            onOpen()
          }}
        >
          {t('common.view')}
        </button>
      </td>
    </tr>
  )
}
