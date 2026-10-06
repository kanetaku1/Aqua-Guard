import { FlaskConical, Info, Microscope } from 'lucide-react'
import { Fragment, useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router'
import { isApiError } from '@/api/client'
import { useRules, useSaveThresholds, useThresholds } from '@/api/queries/admin'
import type { components } from '@/api/schema'
import { Icon } from '@/components/Icon'
import { QueryState } from '@/components/QueryState'
import { cx } from '@/lib/cx'
import { formatDate } from '@/lib/format'
import { PARAM_ICON, isSensorParameter } from '@/lib/params'
import { SaveDialog } from './SaveDialog'
import { BOUNDARIES, HIGH, LOW, changedCells, editable, levelOf, normalText, rowErrors, scaleOf, toDraft, toThreshold, type Boundary, type DraftRow } from './thresholds'

type S = components['schemas']
const LAB_ICON: Record<string, typeof FlaskConical> = { tan: FlaskConical, no2: FlaskConical, vibrio: Microscope, alkalinity: FlaskConical }

/**
 * Thresholds (AD-S-001): the boundary editor — one number per boundary, Normal is derived (05 AD-04).
 * `?farm=<id>` edits a Farm's overrides; rows without an override follow the default.
 */
export function ThresholdsTab({ onDone }: { onDone: (message: string) => void }) {
  const { t } = useTranslation()
  const [params, setParams] = useSearchParams()
  const farmId = params.get('farm') || null
  const thresholds = useThresholds(farmId)
  const defaults = useThresholds(null)

  const setFarm = (id: string) =>
    setParams(
      (p) => {
        if (id) p.set('farm', id)
        else p.delete('farm')
        return p
      },
      { replace: true },
    )

  return (
    <div className="stack" style={{ gap: 24 }}>
      <div className="row-between" style={{ alignItems: 'flex-end' }}>
        <label className="field" style={{ width: 320 }}>
          <span className="field-label">{t('adSettings.thresholds.applyTo')}</span>
          <select className="select" value={farmId ?? ''} onChange={(e) => setFarm(e.target.value)}>
            <option value="">{t('adSettings.thresholds.default')}</option>
            {defaults.data?.farms.map(({ farm, parameters }) => (
              <option key={farm.id} value={farm.id}>
                {parameters.length ? t('adSettings.thresholds.farmOverrides', { farm: farm.name, count: parameters.length }) : t('adSettings.thresholds.farmDefault', { farm: farm.name })}
              </option>
            ))}
          </select>
        </label>
        {thresholds.data && <span className="caption">{t('adSettings.updated', { date: formatDate(thresholds.data.updatedAt), name: thresholds.data.updatedBy.name })}</span>}
      </div>
      <div className="notice">
        <Icon icon={Info} />
        <span>
          <Trans i18nKey="adSettings.thresholds.notice" components={{ b: <b /> }} />
        </span>
      </div>
      <QueryState query={thresholds}>
        {(data) =>
          defaults.data && (
            <Editor key={`${farmId}|${data.updatedAt}`} settings={data} defaults={defaults.data} farmId={farmId} onDone={onDone} />
          )
        }
      </QueryState>
    </div>
  )
}

function Editor({ settings, defaults, farmId, onDone }: { settings: S['ThresholdSettings']; defaults: S['ThresholdSettings']; farmId: string | null; onDone: (message: string) => void }) {
  const { t } = useTranslation()
  const rules = useRules()
  const save = useSaveThresholds(farmId)
  const saved = settings.items.map(toDraft)
  const [draft, setDraft] = useState<DraftRow[]>(saved)
  const [confirming, setConfirming] = useState(false)

  const errors = draft.map((r) => rowErrors(r, t))
  const errorCount = errors.reduce((n, e) => n + Object.keys(e).length, 0)
  const changes = changedCells(draft, saved)
  const errorSides = draft.flatMap((r, i) =>
    (['low', 'high'] as const).filter((side) => (side === 'low' ? LOW : HIGH).some((b) => errors[i][b])).map((side) => t('adSettings.thresholds.side', { name: paramName(r.parameter, t), side: t(`adSettings.thresholds.${side}`) })),
  )

  const setValue = (i: number, b: Boundary, value: string) =>
    setDraft((rows) => rows.map((r, j) => (j === i ? { ...r, inherited: false, values: { ...r.values, [b]: value } } : r)))
  const resetToDefault = (i: number) => {
    const d = defaults.items.find((x) => x.parameter === draft[i].parameter)!
    setDraft((rows) => rows.map((r, j) => (j === i ? { ...toDraft(d), inherited: true } : r)))
  }
  const send = () =>
    save.mutate(draft.filter((r) => !farmId || !r.inherited).map(toThreshold), {
      onSuccess: () => (setConfirming(false), onDone(t('adSettings.thresholds.saved'))),
      onError: () => setConfirming(false),
    })

  const sensors = draft.map((r, i) => [r, i] as const).filter(([r]) => isSensorParameter(r.parameter))
  const lab = draft.map((r, i) => [r, i] as const).filter(([r]) => !isSensorParameter(r.parameter))
  const table = (rows: (readonly [DraftRow, number])[]) => (
    <table className="table th-table">
      <thead>
        <tr>
          <th rowSpan={2}>{t('adSettings.thresholds.parameter')}</th>
          <th colSpan={3} className="th-side">
            {t('adSettings.thresholds.lowSide')}
          </th>
          <th rowSpan={2} className="th-normal">
            {t('severity.normal')}
          </th>
          <th colSpan={3} className="th-side">
            {t('adSettings.thresholds.highSide')}
          </th>
        </tr>
        <tr>
          {BOUNDARIES.map((b) => (
            <th key={b} className="th-cell">
              <span className={`status-text st--${levelOf(b)}`}>{t(`severity.${levelOf(b)}`)}</span>
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map(([r, i]) => {
          const scale = scaleOf(r)
          const rowErrs = Object.values(errors[i])
          return (
            <Fragment key={r.parameter}>
              <tr className="th-row">
                <td rowSpan={2}>
                  <div className="cell-main row" style={{ gap: 8 }}>
                    <Icon icon={isSensorParameter(r.parameter) ? PARAM_ICON[r.parameter] : LAB_ICON[r.parameter]} className="text-muted" />
                    {paramName(r.parameter, t)}
                  </div>
                  <div className="cell-sub">
                    {r.unit || t('adSettings.thresholds.noUnit')} · {t(`adSettings.thresholds.sides.${r.sides}`)}
                  </div>
                  {farmId && (
                    <div className="cell-sub">
                      {r.inherited ? (
                        t('adSettings.thresholds.usesDefault')
                      ) : (
                        <button type="button" className="btn btn--link" style={{ padding: 0, height: 'auto' }} onClick={() => resetToDefault(i)}>
                          {t('adSettings.thresholds.resetDefault')}
                        </button>
                      )}
                    </div>
                  )}
                </td>
                {BOUNDARIES.slice(0, 3).map((b) => (
                  <Cell key={b} row={r} boundary={b} error={errors[i][b]} onChange={(v) => setValue(i, b, v)} />
                ))}
                <td className="th-normal">
                  <b>{normalText(r)}</b>
                </td>
                {BOUNDARIES.slice(3).map((b) => (
                  <Cell key={b} row={r} boundary={b} error={errors[i][b]} onChange={(v) => setValue(i, b, v)} />
                ))}
              </tr>
              <tr className="th-preview">
                <td colSpan={7}>
                  {scale && (
                    <div className="th-scale" aria-hidden="true">
                      <div className="th-scale-bar">
                        {scale.segments.map((s, k) => (
                          <span key={k} style={{ width: `${s.width}%`, background: `var(--status-${s.level}-marker)` }} />
                        ))}
                      </div>
                      <div className="th-scale-ticks">
                        {scale.ticks.map((tick, k) => (
                          <span key={k} style={{ left: `${tick.left}%` }}>
                            {tick.label}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {rowErrs.length > 0 && (
                    <div className="helper is-error" style={{ marginTop: 4 }}>
                      {rowErrs.join(' ')}
                    </div>
                  )}
                </td>
              </tr>
            </Fragment>
          )
        })}
      </tbody>
    </table>
  )

  const overridden = defaults.farms.filter((f) => f.parameters.length)
  const usingDefault = defaults.farms.filter((f) => !f.parameters.length)

  return (
    <>
      <section className="card">
        <div className="card-header">
          <div>
            <h2 className="card-title">{t('adSettings.thresholds.sensors')}</h2>
            <div className="card-sub">{t('adSettings.thresholds.sensorsSub', { minutes: rules.data?.attentionToAlertMinutes ?? 30 })}</div>
          </div>
        </div>
        {table(sensors)}
      </section>
      <section className="card">
        <div className="card-header">
          <div>
            <h2 className="card-title">{t('adSettings.thresholds.lab')}</h2>
            <div className="card-sub">{t('adSettings.thresholds.labSub')}</div>
          </div>
        </div>
        {table(lab)}
      </section>

      <div className="action-bar">
        <div className="action-bar-status">
          <span className={cx('status-text', changes ? 'st--attention' : 'st--normal')}>{changes ? t('adSettings.unsaved', { count: changes }) : t('adSettings.noChanges')}</span>
          {errorCount > 0 && <span className="caption">{t('adSettings.thresholds.errors', { sides: errorSides.join(', '), count: errorCount })}</span>}
          {save.isError && <span className="helper is-error">{isApiError(save.error) ? save.error.problem?.title : t('adUsers.failed')}</span>}
        </div>
        <span className="action-bar-spacer" />
        <button type="button" className="btn btn--outline" disabled={!changes} onClick={() => setDraft(saved)}>
          {t('adSettings.discard')}
        </button>
        <button type="button" className="btn btn--primary" disabled={!changes || errorCount > 0 || save.isPending} onClick={() => setConfirming(true)}>
          {t('adUsers.saveChanges')}
        </button>
      </div>

      {confirming && (
        <SaveDialog title={t('adSettings.thresholds.confirmTitle')} busy={save.isPending} onCancel={() => setConfirming(false)} onConfirm={send}>
          {farmId
            ? t('adSettings.thresholds.confirmFarm', { farm: defaults.farms.find((f) => f.farm.id === farmId)?.farm.name })
            : [
                t('adSettings.thresholds.confirmDefault', { farms: usingDefault.map((f) => f.farm.name).join(', ') }),
                ...overridden.map((f) =>
                  t('adSettings.thresholds.confirmKeeps', { farm: f.farm.name, parameters: f.parameters.map((p) => paramName(p as S['Threshold']['parameter'], t)).join(', ') }),
                ),
              ].join(' ')}
        </SaveDialog>
      )}
    </>
  )
}

/** One boundary: an input, or "Not used" on a side the parameter does not have. */
function Cell({ row, boundary, error, onChange }: { row: DraftRow; boundary: Boundary; error?: string; onChange: (value: string) => void }) {
  const { t } = useTranslation()
  if (!editable(row, boundary)) {
    return (
      <td className="th-cell">
        <span className="th-off">{t('adSettings.thresholds.notUsed')}</span>
      </td>
    )
  }
  const side = LOW.includes(boundary) ? t('adSettings.thresholds.low') : t('adSettings.thresholds.high')
  return (
    <td className="th-cell">
      <input
        className={cx('input th-input', error && 'is-error', row.inherited && 'text-muted')}
        inputMode="decimal"
        placeholder={t('adSettings.thresholds.notUsed')}
        aria-label={`${paramName(row.parameter, t)} ${t(`severity.${levelOf(boundary)}`)} (${side})`}
        aria-invalid={!!error}
        // An empty boundary reads "Not used" in the small size of `.th-off`
        style={row.values[boundary] ? undefined : { fontSize: 'var(--fs-helper)', textAlign: 'center' }}
        value={row.values[boundary]}
        onChange={(e) => onChange(e.target.value)}
      />
    </td>
  )
}

function paramName(p: S['Threshold']['parameter'], t: (key: string) => string) {
  return isSensorParameter(p) ? t(`paramName.${p}`) : t(`labParam.${p}`)
}
