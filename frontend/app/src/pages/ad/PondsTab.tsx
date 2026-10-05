import { Info, Plus } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router'
import { isApiError } from '@/api/client'
import { useAdminPonds, useSavePond } from '@/api/queries/admin'
import type { components } from '@/api/schema'
import { Drawer } from '@/components/Drawer'
import { Icon } from '@/components/Icon'
import { QueryState } from '@/components/QueryState'
import { cx } from '@/lib/cx'
import { formatNumber } from '@/lib/format'
import { fieldError } from './fieldError'

type S = components['schemas']
type PondStatus = S['AdminPond']['status']
const STATUSES: NonNullable<PondStatus>[] = ['in_operation', 'fallow']
const ha = (v: number) => `${formatNumber(v, 1)} ha`

/** Ponds (AD-F-004): the Pond master with device counts. `?editpond=<id>|new` opens the drawer. */
export function PondsTab({ farm, onDone }: { farm: S['AdminFarm']; onDone: (message: string) => void }) {
  const { t } = useTranslation()
  const ponds = useAdminPonds(farm.id)
  const [params, setParams] = useSearchParams()
  const editing = params.get('editpond')
  const setEditing = (value: string | null) =>
    setParams(
      (p) => {
        if (value) p.set('editpond', value)
        else p.delete('editpond')
        return p
      },
      { replace: !value },
    )

  return (
    <section className="card">
      <QueryState query={ponds}>
        {({ items }) => {
          const area = items.reduce((sum, p) => sum + p.areaHa, 0)
          const inOperation = items.filter((p) => p.status === 'in_operation').length
          const pond = items.find((p) => p.id === editing)
          return (
            <>
              <div className="card-header">
                <div>
                  <h2 className="card-title">{t('adFarm.tabs.ponds')}</h2>
                  <div className="card-sub">{t('adFarm.ponds.sub', { count: items.length, area: ha(area), inOperation })}</div>
                </div>
                <button type="button" className="btn btn--primary btn--sm" onClick={() => setEditing('new')}>
                  <Icon icon={Plus} />
                  {t('adFarm.ponds.add')}
                </button>
              </div>
              {items.length === 0 ? (
                <div className="empty">
                  <span className="empty-title">{t('adFarm.ponds.none')}</span>
                  <span>{t('adFarm.ponds.noneHelp')}</span>
                </div>
              ) : (
                <table className="table">
                  <thead>
                    <tr>
                      <th>{t('adFarm.ponds.col.pond')}</th>
                      <th className="num">{t('adFarm.ponds.col.area')}</th>
                      <th>{t('adFarm.ponds.col.status')}</th>
                      <th className="num">{t('adFarm.ponds.col.sensors')}</th>
                      <th className="num">{t('adFarm.ponds.col.actuators')}</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((p) => (
                      <tr key={p.id} className={cx(p.status === 'fallow' && 'is-muted')}>
                        <td className="cell-main">{p.name}</td>
                        <td className="num">{ha(p.areaHa)}</td>
                        <td>
                          <span className={cx('status-text', p.status === 'fallow' ? 'st--neutral st--muted' : 'st--normal')}>{t(`adFarm.pondStatus.${p.status}`)}</span>
                        </td>
                        <td className="num">{p.sensorCount}</td>
                        <td className="num">{p.actuatorCount}</td>
                        <td className="actions">
                          <button type="button" className="btn btn--link" aria-label={t('adFarm.ponds.editPond', { name: p.name })} onClick={() => setEditing(p.id)}>
                            {t('adFarm.edit')}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td>{farm.name}</td>
                      <td className="num">{ha(area)}</td>
                      <td>{t('adFarm.ponds.total', { inOperation, fallow: items.length - inOperation })}</td>
                      <td className="num">{items.reduce((sum, p) => sum + p.sensorCount, 0)}</td>
                      <td className="num">{items.reduce((sum, p) => sum + p.actuatorCount, 0)}</td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              )}
              <div className="card-footer" style={{ justifyContent: 'flex-start' }}>
                <span className="caption">{t('adFarm.ponds.note')}</span>
              </div>
              {(editing === 'new' || pond) && (
                <PondDrawer key={editing} farmId={farm.id} pond={pond ?? null} onClose={() => setEditing(null)} onDone={(message) => (setEditing(null), onDone(message))} />
              )}
            </>
          )
        }}
      </QueryState>
    </section>
  )
}

function PondDrawer({ farmId, pond, onClose, onDone }: { farmId: string; pond: S['AdminPond'] | null; onClose: () => void; onDone: (message: string) => void }) {
  const { t } = useTranslation()
  const save = useSavePond(farmId)
  const [name, setName] = useState(pond?.name ?? '')
  const [area, setArea] = useState(pond ? String(pond.areaHa) : '')
  const [status, setStatus] = useState<NonNullable<PondStatus>>(pond?.status ?? 'in_operation')
  const [tried, setTried] = useState(false)

  const areaHa = Number(area)
  const errors = {
    name: !name.trim() ? t('adFarm.ponds.field.nameRequired') : undefined,
    areaHa: !(area.trim() && areaHa > 0) ? t('adFarm.ponds.field.areaRequired') : undefined,
  }
  const shown = (field: keyof typeof errors) => (tried ? errors[field] : undefined) ?? fieldError(save.error, field)
  const submit = () => {
    setTried(true)
    if (errors.name || errors.areaHa) return
    save.mutate(
      { pondId: pond?.id ?? null, body: { name: name.trim(), areaHa, status } },
      { onSuccess: (p) => onDone(t(pond ? 'adFarm.ponds.saved' : 'adFarm.ponds.added', { name: p.name })) },
    )
  }
  const otherError = save.isError && !fieldError(save.error, 'name') && !fieldError(save.error, 'areaHa')
  // Setting a Pond with devices to Fallow hides it from monitoring while the devices stay assigned
  const resting = pond && pond.status === 'in_operation' && status === 'fallow' && pond.sensorCount + pond.actuatorCount > 0

  return (
    <Drawer
      title={pond ? t('adFarm.ponds.editTitle', { name: pond.name }) : t('adFarm.ponds.add')}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn--outline" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button type="button" className="btn btn--primary" disabled={save.isPending} onClick={submit}>
            {t('adFarm.ponds.save')}
          </button>
        </>
      }
    >
      <label className="field">
        <span className="field-label">
          <span>
            {t('adFarm.ponds.field.name')} <span className="req">*</span>
          </span>
        </span>
        <input className={cx('input', shown('name') && 'is-error')} placeholder={t('adFarm.ponds.field.namePlaceholder')} value={name} onChange={(e) => setName(e.target.value)} />
        {shown('name') && <span className="helper is-error">{shown('name')}</span>}
      </label>
      <label className="field">
        <span className="field-label">
          <span>
            {t('adFarm.ponds.field.area')} <span className="req">*</span>
          </span>
        </span>
        <span className="input-group">
          <input className={cx('input', shown('areaHa') && 'is-error')} inputMode="decimal" value={area} onChange={(e) => setArea(e.target.value)} />
          <span className="input-unit">ha</span>
        </span>
        {shown('areaHa') && <span className="helper is-error">{shown('areaHa')}</span>}
      </label>
      <div className="field">
        <span className="field-label" id="pond-status">
          {t('adFarm.ponds.col.status')}
        </span>
        <div className="choice-list" role="radiogroup" aria-labelledby="pond-status">
          {STATUSES.map((s) => (
            <button
              key={s}
              type="button"
              role="radio"
              aria-checked={status === s}
              className={cx('choice', status === s && 'is-on')}
              style={{ textAlign: 'left', font: 'inherit', color: 'inherit', ...(status === s ? {} : { background: 'var(--color-white)' }) }}
              onClick={() => setStatus(s)}
            >
              <span className={cx('radio', status === s && 'is-on')} />
              <span>
                <b>{t(`adFarm.pondStatus.${s}`)}</b>
                <br />
                <span className="caption">{t(`adFarm.pondStatusHelp.${s}`)}</span>
              </span>
            </button>
          ))}
        </div>
      </div>
      {resting && (
        <div className="notice">
          <Icon icon={Info} />
          <span>{t('adFarm.ponds.fallowNotice', { count: pond.sensorCount + pond.actuatorCount })}</span>
        </div>
      )}
      {otherError && <span className="helper is-error">{isApiError(save.error) ? save.error.problem?.title : t('adUsers.failed')}</span>}
    </Drawer>
  )
}
