import { Plus, X } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { isApiError } from '@/api/client'
import { useGrowthTargets, useSaveGrowthTargets } from '@/api/queries/admin'
import type { components } from '@/api/schema'
import { GrowthVsTargetChart } from '@/components/Charts'
import { Icon } from '@/components/Icon'
import { QueryState } from '@/components/QueryState'
import { cx } from '@/lib/cx'
import { formatDate } from '@/lib/format'
import { SaveDialog } from './SaveDialog'

type S = components['schemas']
type Point = { key: number; doc: string; abw: string }
let nextKey = 1
const num = (v: string) => (/^\d+(\.\d+)?$/.test(v.trim()) ? Number(v) : NaN)

/** Growth Targets (AD-S-002): the target ABW curve by DOC and the On-track band. */
export function GrowthTab({ onDone }: { onDone: (message: string) => void }) {
  const growth = useGrowthTargets()
  return <QueryState query={growth}>{(data) => <GrowthEditor key={data.updatedAt} settings={data} onDone={onDone} />}</QueryState>
}

function GrowthEditor({ settings, onDone }: { settings: S['GrowthTargetSettings']; onDone: (message: string) => void }) {
  const { t } = useTranslation()
  const save = useSaveGrowthTargets()
  const initial = settings.points.map((p) => ({ key: nextKey++, doc: String(p.doc), abw: p.targetAbwG.toFixed(1) }))
  const [points, setPoints] = useState<Point[]>(initial)
  const [band, setBand] = useState(String(settings.onTrackBandPct))
  const [confirming, setConfirming] = useState(false)

  // Row errors: DOC is a whole number after the row above; ABW is above the previous point
  const errors = points.map((p, i) => {
    const prev = points[i - 1]
    const doc = num(p.doc)
    const abw = num(p.abw)
    return {
      doc: !Number.isInteger(doc) ? t('adSettings.growth.docInvalid') : prev && Number.isInteger(num(prev.doc)) && doc <= num(prev.doc) ? t('adSettings.growth.docOrder', { doc: prev.doc }) : undefined,
      abw: !(abw > 0) ? t('adSettings.growth.abwInvalid') : prev && num(prev.abw) > 0 && abw <= num(prev.abw) ? t('adSettings.growth.abwOrder', { abw: prev.abw }) : undefined,
    }
  })
  const bandValue = num(band)
  const bandError = !(bandValue >= 1 && bandValue <= 50) ? t('adSettings.growth.bandInvalid') : undefined
  const hasErrors = errors.some((e) => e.doc || e.abw) || !!bandError
  const value = () => ({ points: points.map((p) => ({ doc: num(p.doc), targetAbwG: num(p.abw) })), onTrackBandPct: bandValue })
  const dirty = JSON.stringify(value()) !== JSON.stringify({ points: settings.points.map((p) => ({ doc: p.doc, targetAbwG: p.targetAbwG })), onTrackBandPct: settings.onTrackBandPct })
  const curve = points.map((p) => ({ doc: num(p.doc), targetAbwG: num(p.abw) })).filter((p) => Number.isInteger(p.doc) && p.targetAbwG > 0)

  const update = (key: number, patch: Partial<Point>) => setPoints((ps) => ps.map((p) => (p.key === key ? { ...p, ...patch } : p)))
  const add = () => {
    const last = points[points.length - 1]
    setPoints((ps) => [...ps, { key: nextKey++, doc: String((Number.isInteger(num(last?.doc ?? '')) ? num(last.doc) : 0) + 7), abw: '' }])
  }
  const discard = () => {
    setPoints(initial)
    setBand(String(settings.onTrackBandPct))
  }
  const send = () =>
    save.mutate(value(), { onSuccess: () => (setConfirming(false), onDone(t('adSettings.growth.saved'))), onError: () => setConfirming(false) })

  return (
    <div className="grid cols-8-4">
      <section className="card">
        <div className="card-header">
          <div>
            <h2 className="card-title">{t('adSettings.growth.curve')}</h2>
            <div className="card-sub">{t('adSettings.growth.curveSub')}</div>
          </div>
          <span className="caption">{t('adSettings.updated', { date: formatDate(settings.updatedAt), name: settings.updatedBy.name })}</span>
        </div>
        <div className="card-body">
          <div className="chart-legend" style={{ marginBottom: 16 }}>
            <span>
              <i className="legend-line dashed" />
              {t('adSettings.growth.target')}
            </span>
            <span>
              {/* Same colours as the band in the chart (FM-03) */}
              <i className="legend-band" style={{ background: '#EDF4F2', borderColor: '#B2D0C4' }} />
              {t('adSettings.growth.band')}
            </span>
          </div>
          {curve.length >= 2 && <GrowthVsTargetChart curve={curve} points={[]} bandPct={bandError ? 0 : bandValue} height={320} tickStep={7} />}
        </div>
        <div className="card-footer">
          {save.isError && <span className="helper is-error">{isApiError(save.error) ? save.error.problem?.title : t('adUsers.failed')}</span>}
          <button type="button" className="btn btn--outline" disabled={!dirty} onClick={discard}>
            {t('adSettings.discard')}
          </button>
          <button type="button" className="btn btn--primary" disabled={!dirty || hasErrors || save.isPending} onClick={() => setConfirming(true)}>
            {t('adUsers.saveChanges')}
          </button>
        </div>
      </section>

      <div className="stack" style={{ gap: 24 }}>
        <section className="card">
          <div className="card-header">
            <h2 className="card-title">{t('adSettings.growth.points')}</h2>
            <button type="button" className="btn btn--link" onClick={add}>
              <Icon icon={Plus} />
              {t('adSettings.growth.addPoint')}
            </button>
          </div>
          <table className="table table-compact">
            <thead>
              <tr>
                <th className="num">{t('adSettings.growth.doc')}</th>
                <th className="num">{t('adSettings.growth.abw')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {points.map((p, i) => (
                <tr key={p.key}>
                  <td className="num">
                    <input
                      className={cx('input th-input', errors[i].doc && 'is-error')}
                      style={{ width: 64 }}
                      inputMode="numeric"
                      aria-label={t('adSettings.growth.docOf', { n: i + 1 })}
                      value={p.doc}
                      onChange={(e) => update(p.key, { doc: e.target.value })}
                    />
                  </td>
                  <td className="num">
                    <input
                      className={cx('input th-input', errors[i].abw && 'is-error')}
                      inputMode="decimal"
                      aria-label={t('adSettings.growth.abwOf', { n: i + 1 })}
                      value={p.abw}
                      onChange={(e) => update(p.key, { abw: e.target.value })}
                    />
                    {(errors[i].doc || errors[i].abw) && (
                      <div className="helper is-error" style={{ whiteSpace: 'normal', textAlign: 'right' }}>
                        {errors[i].doc ?? errors[i].abw}
                      </div>
                    )}
                  </td>
                  <td className="actions">
                    <button
                      type="button"
                      className="icon-btn"
                      aria-label={t('adSettings.growth.remove', { doc: p.doc })}
                      disabled={points.length <= 2}
                      onClick={() => setPoints((ps) => ps.filter((x) => x.key !== p.key))}
                    >
                      <Icon icon={X} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <section className="card">
          <div className="card-header">
            <h2 className="card-title">{t('adSettings.growth.bandTitle')}</h2>
          </div>
          <div className="card-body form-grid">
            <label className="field span-2">
              <span className="field-label">
                <span>
                  {t('adSettings.growth.tolerance')} <span className="req">*</span>
                </span>
              </span>
              <span className="input-group">
                <input className={cx('input', bandError && 'is-error')} inputMode="decimal" value={band} onChange={(e) => setBand(e.target.value)} />
                <span className="input-unit">± %</span>
              </span>
              <span className={cx('helper', bandError && 'is-error')}>{bandError ?? t('adSettings.growth.toleranceHelp')}</span>
            </label>
          </div>
        </section>
      </div>

      {confirming && (
        <SaveDialog title={t('adSettings.growth.confirmTitle')} busy={save.isPending} onCancel={() => setConfirming(false)} onConfirm={send}>
          {t('adSettings.growth.confirmBody')}
        </SaveDialog>
      )}
    </div>
  )
}
