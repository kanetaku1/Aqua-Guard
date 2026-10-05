import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { useOperationalStatus } from '@/api/queries/farms'
import { usePondSamplings, useSaveSampling } from '@/api/queries/pond'
import type { components } from '@/api/schema'
import type { Severity } from '@/api/types'
import { GrowthChart } from '@/components/Charts'
import { DateField } from '@/components/DateField'
import { Card } from '@/components/Page'
import { QueryState } from '@/components/QueryState'
import { cx } from '@/lib/cx'
import { formatCalendarDate, formatNumber, todayInWib } from '@/lib/format'
import { abwOf, docOn } from '@/lib/growth'
import type { Notify } from './PondDetail'

type S = components['schemas']
const LAB = ['tan', 'no2', 'vibrio', 'alkalinity'] as const
type Lab = (typeof LAB)[number]
const LAB_DIGITS: Record<Lab, number> = { tan: 1, no2: 2, vibrio: 1, alkalinity: 0 }
const LAB_UNIT: Record<Lab, string> = { tan: 'mg/L', no2: 'mg/L', vibrio: '×10³', alkalinity: 'mg/L' }

type Form = { date: string; count: string; weight: string; note: string } & Record<Lab, string>
const blank = (): Form => ({ date: todayInWib(), count: '', weight: '', note: '', tan: '', no2: '', vibrio: '', alkalinity: '' })
const parse = (s: string): number | null => (s.trim() === '' ? null : Number(s.replace(/,/g, '')))
const str = (v: number | null | undefined) => (v == null ? '' : String(v))

/** Sampling (TM-PD-016〜018): weekly ABW and Laboratory per Pond, with the growth chart against the target. */
export function SamplingTab({ pond, notify }: { pond: S['PondDetail']; notify: Notify }) {
  const { t } = useTranslation()
  const samplings = usePondSamplings(pond.pond.id)
  const operational = useOperationalStatus(pond.farm.id)
  const save = useSaveSampling(pond.pond.id)
  const [editing, setEditing] = useState<S['SamplingRecord'] | null>(null)
  const [form, setForm] = useState<Form>(blank)
  const [tried, setTried] = useState(false)
  const set = (patch: Partial<Form>) => setForm((f) => ({ ...f, ...patch }))

  const count = parse(form.count)
  const weight = parse(form.weight)
  const countOk = count !== null && Number.isInteger(count) && count >= 1
  const weightOk = weight !== null && Number.isFinite(weight) && weight > 0
  const labOk = LAB.every((k) => {
    const v = parse(form[k])
    return v === null || (Number.isFinite(v) && v >= 0)
  })
  // Preview while typing; the saved ABW comes from the backend
  const abw = countOk && weightOk ? abwOf(count, weight) : null
  const doc = pond.stockedOn ? docOn(pond.stockedOn, form.date) : null

  const reset = () => {
    setEditing(null)
    setForm(blank())
    setTried(false)
    save.reset()
  }
  const edit = (r: S['SamplingRecord']) => {
    setEditing(r)
    setTried(false)
    save.reset()
    setForm({
      date: r.date,
      count: str(r.sampleCount),
      weight: str(r.sampleWeightG),
      note: r.note ?? '',
      tan: str(r.tan),
      no2: str(r.no2),
      vibrio: str(r.vibrio),
      alkalinity: str(r.alkalinity),
    })
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    setTried(true)
    if (!countOk || !weightOk || !labOk) return
    const body: S['SamplingInput'] = {
      date: form.date,
      sampleCount: count,
      sampleWeightG: weight,
      tan: parse(form.tan),
      no2: parse(form.no2),
      vibrio: parse(form.vibrio),
      alkalinity: parse(form.alkalinity),
      note: form.note.trim() || null,
    }
    save.mutate(
      { id: editing?.id, body },
      {
        onSuccess: (r) => {
          notify(t('sampling.saved'), `${pond.pond.name} · ${formatCalendarDate(r.date)} · ABW ${r.abwG === null ? '—' : formatNumber(r.abwG, 1)} g`)
          reset()
        },
      },
    )
  }

  const next = operational.data?.nextSampling

  return (
    <div className="grid cols-8-4">
      <Card title={t('sampling.history')} sub={next ? t('sampling.sub', { date: formatCalendarDate(next) }) : t('sampling.subNoNext')}>
        <QueryState query={samplings}>
          {(data) => (
            <>
              <table className="table">
                <thead>
                  <tr>
                    <th>{t('records.date')}</th>
                    <th className="num">DOC</th>
                    <th className="num">{t('sampling.sample')}</th>
                    <th className="num">ABW</th>
                    <th className="num">ADG</th>
                    <th className="num">TAN</th>
                    <th className="num">NO2</th>
                    <th className="num">Vibrio ×10³</th>
                    <th className="num">Alk.</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((r) => (
                    <tr key={r.id}>
                      <td>{formatCalendarDate(r.date)}</td>
                      <td className="num">{r.doc}</td>
                      <td className="num">{r.sampleCount === null ? '—' : `${r.sampleCount} pcs`}</td>
                      <td className="num strong">{r.abwG === null ? '—' : `${formatNumber(r.abwG, 1)} g`}</td>
                      <td className="num">{r.adgGPerDay == null ? '—' : `${formatNumber(r.adgGPerDay, 2)} g/d`}</td>
                      {LAB.map((k) => {
                        const v = r[k]
                        const sev: Severity | null | undefined = r.labSeverity?.[k]
                        return (
                          <td key={k} className={cx('num', sev && sev !== 'normal' && `val-${sev}`)}>
                            {v == null ? <span className="text-muted">{r.labPending ? t('sampling.pending') : '—'}</span> : formatNumber(v, LAB_DIGITS[k])}
                          </td>
                        )
                      })}
                      <td className="actions">
                        <button type="button" className="btn btn--link btn--sm" onClick={() => edit(r)}>
                          {t('records.edit')}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="card-body" style={{ borderTop: '1px solid var(--color-border)' }}>
                <div className="row-between" style={{ marginBottom: 8 }}>
                  <span className="subsection-title" style={{ margin: 0 }}>
                    {t('sampling.chartTitle', { pond: pond.pond.name })}
                  </span>
                  <div className="chart-legend">
                    <span>
                      <i className="legend-line actual" />
                      {t('sampling.actual')}
                    </span>
                    <span>
                      <i className="legend-line dashed" />
                      {t('sampling.target')}
                    </span>
                  </div>
                </div>
                <GrowthChart
                  actual={data.items.filter((r) => r.abwG !== null).map((r) => ({ doc: r.doc ?? 0, value: r.abwG! }))}
                  target={(() => {
                    const maxDoc = Math.max(0, ...data.items.map((r) => r.doc ?? 0))
                    const minDoc = Math.min(maxDoc, ...data.items.map((r) => r.doc ?? maxDoc))
                    return data.growthCurve.filter((p) => p.doc >= minDoc - 7 && p.doc <= maxDoc + 7).map((p) => ({ doc: p.doc, value: p.targetAbwG }))
                  })()}
                />
              </div>
            </>
          )}
        </QueryState>
      </Card>

      <section className="card">
        <form onSubmit={submit} noValidate>
          <div className="card-header">
            <h2 className="card-title">{editing ? t('sampling.editTitle') : t('sampling.recordTitle')}</h2>
          </div>
          <div className="card-body form-grid">
            <div className="field">
              <span className="field-label">
                <span>
                  {t('records.date')} <span className="req">*</span>
                </span>
              </span>
              <DateField value={form.date} onChange={(date) => set({ date })} />
            </div>
            <label className="field">
              <span className="field-label">DOC</span>
              <input className="input" value={doc ?? '—'} disabled />
            </label>
            <label className="field">
              <span className="field-label">
                <span>
                  {t('sampling.sampleCount')} <span className="req">*</span>
                </span>
              </span>
              <span className="input-group">
                <input className={cx('input', tried && !countOk && 'is-error')} inputMode="numeric" placeholder="100" value={form.count} onChange={(e) => set({ count: e.target.value })} />
                <span className="input-unit">pcs</span>
              </span>
            </label>
            <label className="field">
              <span className="field-label">
                <span>
                  {t('sampling.totalWeight')} <span className="req">*</span>
                </span>
              </span>
              <span className="input-group">
                <input className={cx('input', tried && !weightOk && 'is-error')} inputMode="decimal" placeholder="0" value={form.weight} onChange={(e) => set({ weight: e.target.value })} />
                <span className="input-unit">g</span>
              </span>
            </label>
            <div className="field span-2">
              <span className="field-label">{t('sampling.abwCalculated')}</span>
              <div className="input is-readonly" aria-live="polite">
                {abw === null ? '—' : formatNumber(abw, 1)} g
              </div>
              <span className={cx('helper', tried && (!countOk || !weightOk) && 'is-error')}>
                {tried && (!countOk || !weightOk) ? t('sampling.growthError') : t('sampling.abwHelp')}
              </span>
            </div>
            <div className="subsection-title span-2" style={{ margin: '8px 0 0' }}>
              {t('sampling.laboratory')} <span className="caption">{t('sampling.labHelp')}</span>
            </div>
            {LAB.map((k) => {
              const v = parse(form[k])
              const bad = tried && v !== null && !(Number.isFinite(v) && v >= 0)
              return (
                <label key={k} className="field">
                  <span className="field-label">{t(`sampling.lab.${k}`)}</span>
                  <span className="input-group">
                    <input className={cx('input', bad && 'is-error')} inputMode="decimal" placeholder="—" value={form[k]} onChange={(e) => set({ [k]: e.target.value } as Partial<Form>)} />
                    <span className="input-unit">{LAB_UNIT[k]}</span>
                  </span>
                </label>
              )
            })}
            <label className="field span-2">
              <span className="field-label">{t('records.note')}</span>
              <textarea className="textarea" placeholder={t('sampling.notePlaceholder')} value={form.note} onChange={(e) => set({ note: e.target.value })} />
            </label>
            {save.isError && (
              <span className="helper is-error span-2" role="alert">
                {t('records.saveFailed')}
              </span>
            )}
          </div>
          <div className="card-footer">
            <button type="button" className="btn btn--outline" onClick={reset}>
              {editing ? t('common.cancel') : t('records.clear')}
            </button>
            <button type="submit" className="btn btn--primary" disabled={save.isPending}>
              {t('records.save')}
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}
