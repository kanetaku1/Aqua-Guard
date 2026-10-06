import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { useMortalities, useSaveMortality } from '@/api/queries/pond'
import type { components } from '@/api/schema'
import { DateField } from '@/components/DateField'
import { Card } from '@/components/Page'
import { QueryState } from '@/components/QueryState'
import { cx } from '@/lib/cx'
import { formatCalendarDate, formatNumber, todayInWib } from '@/lib/format'
import type { Notify } from './PondDetail'

type S = components['schemas']
type Observation = S['MortalityObservation']
const OBSERVATIONS: Observation[] = ['routine_check', 'low_do', 'disease_signs', 'molting', 'other']

type Form = { date: string; count: string; weight: string; observation: Observation | ''; note: string }
const blank = (): Form => ({ date: todayInWib(), count: '', weight: '', observation: '', note: '' })
const num = (s: string) => (s.trim() === '' ? NaN : Number(s.replace(/,/g, '')))

/** Mortality (TM-PD-013〜015): daily count and weight, with the observation. */
export function MortalityTab({ pond, notify }: { pond: S['PondDetail']; notify: Notify }) {
  const { t } = useTranslation()
  const mortalities = useMortalities(pond.pond.id)
  const save = useSaveMortality(pond.pond.id)
  const [editing, setEditing] = useState<S['MortalityRecord'] | null>(null)
  const [form, setForm] = useState<Form>(blank)
  const [tried, setTried] = useState(false)
  const set = (patch: Partial<Form>) => setForm((f) => ({ ...f, ...patch }))

  const count = num(form.count)
  const weight = num(form.weight)
  const countOk = Number.isInteger(count) && count >= 0
  const weightOk = Number.isFinite(weight) && weight >= 0

  const reset = () => {
    setEditing(null)
    setForm(blank())
    setTried(false)
    save.reset()
  }
  const edit = (r: S['MortalityRecord']) => {
    setEditing(r)
    setTried(false)
    save.reset()
    setForm({ date: r.date, count: String(r.count), weight: String(r.weightKg), observation: r.observation ?? '', note: r.note ?? '' })
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    setTried(true)
    if (!countOk || !weightOk) return
    save.mutate(
      {
        id: editing?.id,
        body: { date: form.date, count, weightKg: weight, observation: form.observation || null, note: form.note.trim() || null },
      },
      {
        onSuccess: (r) => {
          notify(t('mortality.saved'), `${pond.pond.name} · ${formatCalendarDate(r.date)} · ${formatNumber(r.count)} pcs`)
          reset()
        },
      },
    )
  }

  const last7 = mortalities.data?.last7Days

  return (
    <div className="grid cols-8-4">
      <Card
        title={t('mortality.history')}
        sub={last7 && t('mortality.last7', { count: formatNumber(last7.count), kg: formatNumber(last7.weightKg, 2) })}
      >
        <QueryState query={mortalities}>
          {(data) => (
            <table className="table">
              <thead>
                <tr>
                  <th>{t('records.date')}</th>
                  <th className="num">{t('mortality.count')}</th>
                  <th className="num">{t('mortality.weight')}</th>
                  <th>{t('mortality.observation')}</th>
                  <th>{t('records.recordedBy')}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.items.map((r) => (
                  <tr key={r.id}>
                    <td>{formatCalendarDate(r.date, 'd MMM yyyy')}</td>
                    <td className="num">{formatNumber(r.count)}</td>
                    <td className="num">{formatNumber(r.weightKg, 2)} kg</td>
                    <td className={r.observation ? undefined : 'text-muted'}>{r.observation ? t(`observation.${r.observation}`) : '—'}</td>
                    <td>{r.recordedBy.name}</td>
                    <td className="actions">
                      <button type="button" className="btn btn--link btn--sm" onClick={() => edit(r)}>
                        {t('records.edit')}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </QueryState>
      </Card>

      <section className="card">
        <form onSubmit={submit} noValidate>
          <div className="card-header">
            <h2 className="card-title">{editing ? t('mortality.editTitle') : t('mortality.recordTitle')}</h2>
          </div>
          <div className="card-body form-grid">
            <div className="field span-2">
              <span className="field-label">
                <span>
                  {t('records.date')} <span className="req">*</span>
                </span>
              </span>
              <DateField value={form.date} onChange={(date) => set({ date })} />
            </div>
            <label className="field">
              <span className="field-label">
                <span>
                  {t('mortality.count')} <span className="req">*</span>
                </span>
              </span>
              <span className="input-group">
                <input className={cx('input', tried && !countOk && 'is-error')} inputMode="numeric" placeholder="0" value={form.count} onChange={(e) => set({ count: e.target.value })} />
                <span className="input-unit">pcs</span>
              </span>
            </label>
            <label className="field">
              <span className="field-label">
                <span>
                  {t('mortality.weight')} <span className="req">*</span>
                </span>
              </span>
              <span className="input-group">
                <input className={cx('input', tried && !weightOk && 'is-error')} inputMode="decimal" placeholder="0.00" value={form.weight} onChange={(e) => set({ weight: e.target.value })} />
                <span className="input-unit">kg</span>
              </span>
            </label>
            {tried && (!countOk || !weightOk) && <span className="helper is-error span-2">{t('mortality.error')}</span>}
            <label className="field span-2">
              <span className="field-label">{t('mortality.observation')}</span>
              <select className="select" value={form.observation} onChange={(e) => set({ observation: e.target.value as Observation | '' })}>
                <option value="">{t('mortality.selectObservation')}</option>
                {OBSERVATIONS.map((o) => (
                  <option key={o} value={o}>
                    {t(`observation.${o}`)}
                  </option>
                ))}
              </select>
            </label>
            <label className="field span-2">
              <span className="field-label">{t('records.note')}</span>
              <textarea className="textarea" placeholder={t('mortality.notePlaceholder')} value={form.note} onChange={(e) => set({ note: e.target.value })} />
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
