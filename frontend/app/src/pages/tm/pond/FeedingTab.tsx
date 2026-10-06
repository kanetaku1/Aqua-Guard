import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { isApiError } from '@/api/client'
import { useFeedings, useSaveFeeding } from '@/api/queries/pond'
import type { components } from '@/api/schema'
import { DateField } from '@/components/DateField'
import { Card } from '@/components/Page'
import { QueryState } from '@/components/QueryState'
import { cx } from '@/lib/cx'
import { formatCalendarDate, formatNumber, todayInWib } from '@/lib/format'
import type { Notify } from './PondDetail'

type S = components['schemas']
type TrayCheck = S['TrayCheck']
const TRAY_CHECKS: TrayCheck[] = ['empty_within_2h', 'leftover_under_5', 'leftover_10', 'leftover_over_20']
const ORDINAL = ['1st', '2nd', '3rd', '4th', '5th', '6th']

type Form = { date: string; round: string; feedType: string; amount: string; tray: TrayCheck | ''; note: string }

/** Feeding (TM-PD-010〜012): history + record / edit one round. */
export function FeedingTab({ pond, notify }: { pond: S['PondDetail']; notify: Notify }) {
  const { t } = useTranslation()
  const feedings = useFeedings(pond.pond.id)
  const save = useSaveFeeding(pond.pond.id)
  const [editing, setEditing] = useState<S['FeedingRecord'] | null>(null)
  const today = todayInWib()

  // New record: today, the first round not recorded yet
  const blank = (records: S['FeedingRecord'][] = []): Form => {
    const done = new Set(records.filter((r) => r.date === today).map((r) => r.round))
    const next = pond.feeding.schedule.findIndex((_, i) => !done.has(i + 1))
    return {
      date: today,
      round: next >= 0 ? String(next + 1) : '',
      feedType: records[0]?.feedType ?? pond.feeding.feedTypes[0] ?? '',
      amount: '',
      tray: '',
      note: '',
    }
  }
  const [form, setForm] = useState<Form | null>(null)
  const current = form ?? blank(feedings.data?.items)
  const set = (patch: Partial<Form>) => setForm({ ...current, ...patch })
  const [tried, setTried] = useState(false)

  const amount = Number(current.amount.replace(/,/g, ''))
  const amountOk = current.amount.trim() !== '' && Number.isFinite(amount) && amount > 0
  const valid = amountOk && !!current.round && !!current.feedType
  const plan = current.date === today ? pond.feeding.planToday.find((p) => String(p.round) === current.round) : undefined

  const reset = () => {
    setEditing(null)
    setForm(null)
    setTried(false)
    save.reset()
  }
  const edit = (r: S['FeedingRecord']) => {
    setEditing(r)
    setTried(false)
    save.reset()
    setForm({ date: r.date, round: String(r.round), feedType: r.feedType, amount: String(r.amountKg), tray: r.trayCheck ?? '', note: r.note ?? '' })
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    setTried(true)
    if (!valid) return
    const body: S['FeedingInput'] = {
      date: current.date,
      round: Number(current.round),
      feedType: current.feedType,
      amountKg: amount,
      trayCheck: current.tray || null,
      note: current.note.trim() || null,
    }
    save.mutate(
      { id: editing?.id, body },
      {
        onSuccess: (r) => {
          notify(
            t('feeding.saved'),
            `${pond.pond.name} · ${formatCalendarDate(r.date)} ${r.time} · ${formatNumber(r.amountKg)} kg`,
          )
          reset()
        },
      },
    )
  }

  const totals = feedings.data?.dailyTotals ?? []

  return (
    <div className="grid cols-8-4">
      <Card
        title={t('feeding.history')}
        sub={totals
          .map((d) =>
            t(d.date === today ? 'feeding.soFar' : 'feeding.total', { date: formatCalendarDate(d.date), kg: formatNumber(d.totalKg) }),
          )
          .join(' · ')}
      >
        <QueryState query={feedings}>
          {(data) => (
            <table className="table">
              <thead>
                <tr>
                  <th>{t('feeding.dateTime')}</th>
                  <th>{t('feeding.feedType')}</th>
                  <th className="num">{t('feeding.amount')}</th>
                  <th>{t('feeding.tray')}</th>
                  <th>{t('records.recordedBy')}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.items.map((r) => (
                  <tr key={r.id}>
                    <td>
                      {formatCalendarDate(r.date)} {r.time}
                    </td>
                    <td>{r.feedType}</td>
                    <td className="num">{formatNumber(r.amountKg)} kg</td>
                    <td className={r.trayCheck ? undefined : 'text-muted'}>{r.trayCheck ? t(`trayCheck.${r.trayCheck}`) : '—'}</td>
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
            <h2 className="card-title">{editing ? t('feeding.editTitle') : t('feeding.recordTitle')}</h2>
          </div>
          <div className="card-body form-grid">
            <div className="field">
              <span className="field-label">
                <span>
                  {t('records.date')} <span className="req">*</span>
                </span>
              </span>
              <DateField value={current.date} onChange={(date) => set({ date })} />
            </div>
            <label className="field">
              <span className="field-label">
                <span>
                  {t('feeding.round')} <span className="req">*</span>
                </span>
              </span>
              <select className="select" value={current.round} onChange={(e) => set({ round: e.target.value })}>
                <option value="">{t('records.select')}</option>
                {pond.feeding.schedule.map((time, i) => (
                  <option key={time} value={String(i + 1)}>
                    {time} ({ORDINAL[i] ?? i + 1})
                  </option>
                ))}
              </select>
            </label>
            <label className="field span-2">
              <span className="field-label">
                <span>
                  {t('feeding.feedType')} <span className="req">*</span>
                </span>
              </span>
              <select className="select" value={current.feedType} onChange={(e) => set({ feedType: e.target.value })}>
                {pond.feeding.feedTypes.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </label>
            <label className="field span-2">
              <span className="field-label">
                <span>
                  {t('feeding.amount')} <span className="req">*</span>
                </span>
              </span>
              <span className="input-group">
                <input
                  className={cx('input', tried && !amountOk && 'is-error')}
                  inputMode="decimal"
                  placeholder={plan ? String(plan.amountKg) : '0'}
                  value={current.amount}
                  onChange={(e) => set({ amount: e.target.value })}
                />
                <span className="input-unit">kg</span>
              </span>
              {tried && !amountOk ? (
                <span className="helper is-error">{t('feeding.amountError')}</span>
              ) : (
                plan && (
                  <span className="helper">
                    {t('feeding.plan', { kg: formatNumber(plan.amountKg) })}
                    {plan.note && ` · ${plan.note}`}
                  </span>
                )
              )}
            </label>
            <label className="field span-2">
              <span className="field-label">{t('feeding.tray')}</span>
              <select className="select" value={current.tray} onChange={(e) => set({ tray: e.target.value as TrayCheck | '' })}>
                <option value="">{t('feeding.selectStatus')}</option>
                {TRAY_CHECKS.map((c) => (
                  <option key={c} value={c}>
                    {t(`trayCheck.${c}`)}
                  </option>
                ))}
              </select>
            </label>
            <label className="field span-2">
              <span className="field-label">{t('records.note')}</span>
              <textarea className="textarea" placeholder={t('records.optional')} value={current.note} onChange={(e) => set({ note: e.target.value })} />
            </label>
            {save.isError && (
              <span className="helper is-error span-2" role="alert">
                {isApiError(save.error, 409) ? t('feeding.duplicate') : t('records.saveFailed')}
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
