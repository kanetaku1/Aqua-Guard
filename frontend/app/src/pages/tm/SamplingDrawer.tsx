import { Info, TriangleAlert } from 'lucide-react'
import { useId, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { useFarmSamplings, useSaveSamplings, type SamplingEntry } from '@/api/queries/ponds'
import type { GrowthTargetPoint, PondListRow, SamplingRecord } from '@/api/types'
import { DateField } from '@/components/DateField'
import { Drawer } from '@/components/Drawer'
import { Icon } from '@/components/Icon'
import { QueryState } from '@/components/QueryState'
import { cx } from '@/lib/cx'
import { formatCalendarDate, formatNumber, formatSignedPct, todayInWib } from '@/lib/format'
import { abwOf, docOn, judgeGrowth, targetAbwAt, vsTargetPct } from '@/lib/growth'

/**
 * TM-P-005 Record weekly sampling (06 TM-02 `?sampling=1`): growth (sample count + total weight → ABW)
 * and optional Laboratory values for every Pond at once. Empty Ponds are "Not sampled";
 * lab results can be added later. ABW / vs Target shown here are a preview — the backend computes the saved values.
 */

const FIELDS = ['count', 'weight', 'tan', 'no2', 'vibrio', 'alk'] as const
type Field = (typeof FIELDS)[number]
type RowInput = Record<Field, string>
const EMPTY: RowInput = { count: '', weight: '', tan: '', no2: '', vibrio: '', alk: '' }

/** "1,930" → 1930, "" → null, anything else that is not a number → NaN. */
const parse = (s: string): number | null => (s.trim() === '' ? null : Number(s.replace(/,/g, '').trim()))

type Evaluated = { entry: Omit<SamplingEntry, 'pondId'> | null; errors: Set<Field>; abw: number | null }

/** Validate one Pond's inputs (sample count and total weight go together; numbers only). */
function evaluateRow(input: RowInput): Evaluated {
  const v = Object.fromEntries(FIELDS.map((f) => [f, parse(input[f])])) as Record<Field, number | null>
  const errors = new Set<Field>()
  const bad = (n: number | null, ok: (x: number) => boolean) => n !== null && (Number.isNaN(n) || !ok(n))
  if (bad(v.count, (x) => Number.isInteger(x) && x >= 1)) errors.add('count')
  if (bad(v.weight, (x) => x > 0)) errors.add('weight')
  if (v.count === null && v.weight !== null) errors.add('count')
  if (v.weight === null && v.count !== null) errors.add('weight')
  for (const f of ['tan', 'no2', 'vibrio', 'alk'] as const) if (bad(v[f], (x) => x >= 0)) errors.add(f)

  const hasValue = FIELDS.some((f) => v[f] !== null)
  const growthOk = v.count !== null && v.weight !== null && !errors.has('count') && !errors.has('weight')
  return {
    errors,
    abw: growthOk ? abwOf(v.count!, v.weight!) : null,
    entry: hasValue
      ? {
          sampleCount: v.count,
          sampleWeightG: v.weight,
          tan: v.tan,
          no2: v.no2,
          vibrio: v.vibrio,
          alkalinity: v.alk,
        }
      : null,
  }
}

const fromRecord = (r: SamplingRecord): RowInput => ({
  count: r.sampleCount == null ? '' : String(r.sampleCount),
  weight: r.sampleWeightG == null ? '' : formatNumber(r.sampleWeightG),
  tan: r.tan == null ? '' : String(r.tan),
  no2: r.no2 == null ? '' : String(r.no2),
  vibrio: r.vibrio == null ? '' : String(r.vibrio),
  alk: r.alkalinity == null ? '' : String(r.alkalinity),
})

export function SamplingDrawer({
  farmId,
  farmName,
  ponds,
  initialDate,
  onClose,
  onSaved,
}: {
  farmId: string
  farmName: string
  ponds: PondListRow[]
  initialDate?: string
  onClose: () => void
  onSaved: (message: string) => void
}) {
  const { t } = useTranslation()
  const formId = useId()
  const [date, setDate] = useState(initialDate ?? todayInWib())
  const samplings = useFarmSamplings(farmId, date)
  const save = useSaveSamplings(farmId)
  const stocked = ponds.filter((p) => p.stockedOn).sort((a, b) => a.pond.name.localeCompare(b.pond.name))

  return (
    <Drawer
      wide
      caption={t('tmPonds.sampling.caption', { farm: farmName, count: stocked.length })}
      title={t('tmPonds.recordSampling')}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn--outline" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button type="submit" form={formId} className="btn btn--primary" disabled={save.isPending || !samplings.data}>
            {t('tmPonds.sampling.save')}
          </button>
        </>
      }
    >
      <QueryState query={samplings}>
        {(data) => (
          <SamplingForm
            key={date}
            formId={formId}
            date={date}
            onDateChange={setDate}
            ponds={stocked}
            records={data.items}
            curve={data.growthCurve}
            bandPct={data.onTrackBandPct}
            saveFailed={save.isError}
            onSubmit={(entries) =>
              save.mutate(
                { date, entries },
                {
                  onSuccess: () =>
                    onSaved(
                      t('tmPonds.sampling.saved', {
                        date: formatCalendarDate(date, 'd MMM yyyy'),
                        count: entries.length,
                      }),
                    ),
                },
              )
            }
          />
        )}
      </QueryState>
    </Drawer>
  )
}

function SamplingForm({
  formId,
  date,
  onDateChange,
  ponds,
  records,
  curve,
  bandPct,
  saveFailed,
  onSubmit,
}: {
  formId: string
  date: string
  onDateChange: (date: string) => void
  ponds: PondListRow[]
  records: SamplingRecord[]
  curve: GrowthTargetPoint[]
  bandPct: number
  saveFailed: boolean
  onSubmit: (entries: SamplingEntry[]) => void
}) {
  const { t } = useTranslation()
  const dateId = useId()
  const [rows, setRows] = useState<Record<string, RowInput>>(() =>
    Object.fromEntries(
      ponds.map((p) => {
        const record = records.find((r) => r.pondId === p.pond.id)
        return [p.pond.id, record ? fromRecord(record) : EMPTY]
      }),
    ),
  )
  const [showErrors, setShowErrors] = useState(false)

  const evaluated = Object.fromEntries(ponds.map((p) => [p.pond.id, evaluateRow(rows[p.pond.id] ?? EMPTY)]))
  const entered = ponds.filter((p) => evaluated[p.pond.id].abw !== null).length
  const hasErrors = ponds.some((p) => evaluated[p.pond.id].errors.size > 0)

  const set = (pondId: string, field: Field, value: string) =>
    setRows((r) => ({ ...r, [pondId]: { ...(r[pondId] ?? EMPTY), [field]: value } }))

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (hasErrors) {
      setShowErrors(true)
      return
    }
    const entries = ponds.flatMap((p) => {
      const entry = evaluated[p.pond.id].entry
      return entry ? [{ pondId: p.pond.id, ...entry }] : []
    })
    if (entries.length > 0) onSubmit(entries)
  }

  const input = (pond: PondListRow, field: Field, label: string, width: number, placeholder = '—') => {
    const invalid = showErrors && evaluated[pond.pond.id].errors.has(field)
    return (
      <input
        className={cx('input', invalid && 'is-error')}
        inputMode="decimal"
        style={{ width, textAlign: 'right' }}
        placeholder={placeholder}
        aria-label={t('tmPonds.sampling.fieldLabel', { field: label, pond: pond.pond.name })}
        aria-invalid={invalid || undefined}
        value={rows[pond.pond.id]?.[field] ?? ''}
        onChange={(e) => set(pond.pond.id, field, e.target.value)}
      />
    )
  }

  return (
    // `display: contents` keeps the sections as direct children of .drawer-body (prototype spacing).
    <form id={formId} style={{ display: 'contents' }} onSubmit={submit} noValidate>
      <div className="form-grid">
        <div className="field">
          <label className="field-label" htmlFor={dateId}>
            <span>
              {t('tmPonds.sampling.date')} <span className="req">*</span>
            </span>
          </label>
          {/* Planned sampling dates may be in the future (07 Date Field). */}
          <DateField id={dateId} value={date} onChange={onDateChange} allowFuture />
        </div>
        <div className="field">
          <span className="field-label">{t('tmPonds.sampling.progress')}</span>
          <div className="input is-readonly">{t('tmPonds.sampling.progressValue', { entered, total: ponds.length })}</div>
        </div>
      </div>

      {showErrors && hasErrors && (
        <div className="notice notice--warning" role="alert">
          <Icon icon={TriangleAlert} />
          <span>{t('tmPonds.sampling.fixErrors')}</span>
        </div>
      )}
      {saveFailed && (
        <div className="notice notice--warning" role="alert">
          <Icon icon={TriangleAlert} />
          <span>{t('tmPonds.sampling.saveError')}</span>
        </div>
      )}

      <table className="table table-compact">
        <thead>
          <tr>
            <th rowSpan={2}>{t('tmPonds.pond')}</th>
            <th rowSpan={2} className="num">
              {t('tmPonds.sampling.doc')}
            </th>
            <th colSpan={4}>{t('tmPonds.sampling.growth')}</th>
            <th colSpan={4}>
              {t('tmPonds.sampling.laboratory')} <span className="caption">{t('tmPonds.sampling.optional')}</span>
            </th>
          </tr>
          <tr>
            <th>{t('tmPonds.sampling.sampleCount')}</th>
            <th>{t('tmPonds.sampling.totalWeight')}</th>
            <th className="num">{t('tmPonds.sampling.abw')}</th>
            <th>{t('tmPonds.sampling.vsTarget')}</th>
            <th>{t('tmPonds.sampling.tan')}</th>
            <th>{t('tmPonds.sampling.no2')}</th>
            <th>{t('tmPonds.sampling.vibrio')}</th>
            <th>{t('tmPonds.sampling.alkalinity')}</th>
          </tr>
        </thead>
        <tbody>
          {ponds.map((p) => {
            const doc = docOn(p.stockedOn!, date)
            const { abw } = evaluated[p.pond.id]
            const target = abw === null ? null : targetAbwAt(curve, doc)
            const pct = abw !== null && target ? vsTargetPct(abw, target) : null
            const growth = pct === null ? null : judgeGrowth(pct, bandPct)
            return (
              <tr key={p.pond.id}>
                <td className="cell-main">{p.pond.name}</td>
                <td className="num">{doc}</td>
                <td className="cell-input">{input(p, 'count', t('tmPonds.sampling.sampleCount'), 64, '100')}</td>
                <td className="cell-input">
                  <span className="input-group">
                    {input(p, 'weight', t('tmPonds.sampling.totalWeight'), 104, '0')}
                    <span className="input-unit">g</span>
                  </span>
                </td>
                {abw === null ? (
                  <>
                    <td className="num text-muted">—</td>
                    <td className="text-muted">{t('tmPonds.sampling.notSampled')}</td>
                  </>
                ) : (
                  <>
                    <td className="num strong">{formatNumber(abw, 1)} g</td>
                    <td>
                      {pct !== null && growth && (
                        <span className={cx('status-text', growth === 'behind' ? 'st--attention' : 'st--normal')}>
                          {formatSignedPct(pct)} {t(`growth.${growth}`)}
                        </span>
                      )}
                    </td>
                  </>
                )}
                <td className="cell-input">{input(p, 'tan', t('tmPonds.sampling.tan'), 56)}</td>
                <td className="cell-input">{input(p, 'no2', t('tmPonds.sampling.no2'), 56)}</td>
                <td className="cell-input">{input(p, 'vibrio', t('tmPonds.sampling.vibrio'), 56)}</td>
                <td className="cell-input">{input(p, 'alk', t('tmPonds.sampling.alkalinity'), 56)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>

      <div className="notice">
        <Icon icon={Info} />
        <span>{t('tmPonds.sampling.notice')}</span>
      </div>
    </form>
  )
}
