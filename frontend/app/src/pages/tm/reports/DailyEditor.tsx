import { Bell, Database, Info, Plus, Save, Send, TriangleAlert } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useSearchParams } from 'react-router'
import { useOperationalStatus } from '@/api/queries/farms'
import { useSaveDailyReport, useSubmitReport } from '@/api/queries/reports'
import type { components } from '@/api/schema'
import { Check } from '@/components/Check'
import { ConfirmDialog } from '@/components/Controls'
import { Icon } from '@/components/Icon'
import { Card } from '@/components/Page'
import { ReportStateText, StatusMark, AlertStateText } from '@/components/StatusMark'
import { cx } from '@/lib/cx'
import { formatCalendarDate, formatDuration, formatNumber, formatRecentTime, formatTime } from '@/lib/format'
import { isSensorParameter } from '@/lib/params'
import { ActionDrawer, EquipmentDrawer, PondDrawer } from './DailyDrawers'
import { alertName } from '@/lib/alerts'
import { missingOf, readiness, toDraft, toInput, type DailyReport, type Draft, type ManualAction, type ManualEvent } from './draft'

type S = components['schemas']
const WEATHER: S['Weather'][] = ['sunny', 'cloudy', 'rain', 'heavy_rain']
/** Draft autosave interval (07 §16 未確定事項: 30 s, provisional). */
const AUTOSAVE_MS = 30_000

const levelClass = (level: 'normal' | 'attention' | 'warning') => `st--${level}`
const appetiteLevel = (a: S['Appetite']) => (a === 'good' ? 'normal' : a === 'reduced' ? 'attention' : 'warning')
const trayLevel = (t: S['TrayCondition']) => (t === 'clean' ? 'normal' : t === 'leftover' ? 'attention' : 'warning')

/**
 * TM-04 Daily Report — Create / Edit (05 §5 TM-04, 06 TM-04, prototype screens/tm-daily-report.html).
 * Mostly a review screen: records, alerts and actuator logs are collected automatically; the TM adds
 * observations, Farm-wide weather and the summary. Sensor values are never entered here.
 */
export function DailyEditor({ report, onToast }: { report: DailyReport; onToast: (message: string, detail?: string) => void }) {
  const { t } = useTranslation()
  const [params, setParams] = useSearchParams()
  const readOnly = report.status === 'submitted'
  const [draft, setDraft] = useState<Draft>(() => toDraft(report))
  const [dirty, setDirty] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const [actionEdit, setActionEdit] = useState<ManualAction | 'new' | null>(null)
  const [eventEdit, setEventEdit] = useState<ManualEvent | 'new' | null>(null)
  const save = useSaveDailyReport(report.id)
  const submit = useSubmitReport(report.id)
  const operational = useOperationalStatus(report.farm.id)

  const update = (patch: Partial<Draft>) => {
    setDraft((d) => ({ ...d, ...patch }))
    setDirty(true)
  }

  // Save Draft (and autosave): the server returns the rebuilt report; keep the local inputs.
  const draftRef = useRef(draft)
  useEffect(() => {
    draftRef.current = draft
  }, [draft])
  const saveDraft = useCallback(
    (onSaved?: () => void) =>
      save.mutate(toInput(draftRef.current), {
        onSuccess: () => {
          setDirty(false)
          onSaved?.()
        },
      }),
    [save],
  )
  useEffect(() => {
    if (!dirty || readOnly) return
    const timer = setTimeout(() => saveDraft(), AUTOSAVE_MS)
    return () => clearTimeout(timer)
  }, [dirty, draft, readOnly, saveDraft])

  const missing = missingOf(draft)
  const ready = readiness(report, draft)
  const pondOptions = report.ponds.map((p) => p.pond)
  const included = report.alerts.filter((a) => !draft.excludedAlertIds.includes(a.id))
  const observedPonds = report.ponds.filter((p) => {
    const v = draft.ponds[p.pond.id]
    return v && (v.health !== 'normal' || v.observations.length > 0)
  }).length
  // Most severe first, then newest (prototype order)
  const rank = (sev: string) => ['critical', 'warning', 'attention', 'normal'].indexOf(sev)
  const sortedAlerts = [...report.alerts].sort((x, y) => rank(x.severity) - rank(y.severity) || y.occurredAt.localeCompare(x.occurredAt))
  const autoEvents = report.equipmentEvents.filter((e) => e.source !== 'manual').length
  const missingText = missing.map((m) => t(`daily.missing.${m}`)).join(t('daily.and'))

  const pondId = params.get('pond')
  const pondRow = report.ponds.find((p) => p.pond.id === pondId)
  const closePond = () =>
    setParams(
      (p) => {
        p.delete('pond')
        return p
      },
      { replace: true },
    )

  const doSubmit = () => {
    const run = () =>
      submit.mutate(undefined, {
        onSuccess: () => {
          setConfirm(false)
          onToast(t('daily.submitted'), t('daily.submittedDetail', { date: formatCalendarDate(report.date!) }))
        },
      })
    if (dirty) saveDraft(run)
    else run()
  }

  // Ponds × Farm totals for the table footer (counts follow the unsaved inputs)
  const rows = report.ponds.map((p) => ({ ...p, ...(draft.ponds[p.pond.id] ?? {}) }))
  const minRounds = Math.min(...report.ponds.map((p) => p.feedRounds))
  const fedPonds = report.ponds.filter((p) => p.feedRounds > 0).length

  return (
    <div className="stack" style={{ gap: 24 }}>
      {readOnly && (
        <div className="notice">
          <Icon icon={Info} />
          <span>{t('daily.readOnly', { time: report.submittedAt ? formatRecentTime(report.submittedAt) : '' })}</span>
        </div>
      )}

      {!readOnly && (
        <section className="card">
          <div className="card-header">
            <div>
              <h2 className="card-title">{t('daily.completion')}</h2>
              <div className="card-sub">{t('daily.completionSub')}</div>
            </div>
            <div style={{ width: 240 }}>
              <div className="row-between caption" style={{ marginBottom: 4 }}>
                <span>{t('daily.ready', { pct: ready })}</span>
                <span>{t('daily.toFill', { count: missing.length })}</span>
              </div>
              <div className="progress" role="progressbar" aria-valuenow={ready} aria-valuemin={0} aria-valuemax={100}>
                <span style={{ width: `${ready}%` }} />
              </div>
            </div>
          </div>
          <div className="checklist" style={{ gridTemplateColumns: 'repeat(4,minmax(0,1fr))' }}>
            <div>
              <span className={cx('status-text', fedPonds === report.ponds.length ? 'st--normal' : 'st--attention')}>
                <b>{t('daily.check.records')}</b>
              </span>
              <span className="caption">{t('daily.check.recordsDetail', { fed: fedPonds, total: report.ponds.length, rounds: minRounds, planned: report.ponds[0]?.feedRoundsPlanned ?? 0 })}</span>
            </div>
            <div>
              <span className="status-text st--normal">
                <b>{t('daily.check.auto')}</b>
              </span>
              <span className="caption">
                {t('daily.check.autoDetail', { events: t('daily.check.events', { count: autoEvents + draft.manualEvents.length }), alerts: t('daily.check.alerts', { count: included.length }) })}
              </span>
            </div>
            <div>
              <span className="status-text st--neutral">
                <b>{t('daily.check.health')}</b>
              </span>
              <span className="caption">{t('daily.check.healthDetail', { count: observedPonds })}</span>
            </div>
            <div>
              <span className={cx('status-text', missing.length ? 'st--attention' : 'st--normal')}>
                <b>{t('daily.check.farm')}</b>
              </span>
              <span className="caption">{missing.length ? t('daily.check.farmNeeded', { items: missingText }) : t('daily.check.farmDone')}</span>
            </div>
          </div>
        </section>
      )}

      {/* 2–4 Feeding · Mortality · Health */}
      <Card
        title={t('daily.ponds.title')}
        sub={t('daily.ponds.sub')}
        action={
          <span className="source-tag">
            <Icon icon={Database} />
            {t('daily.ponds.source')}
          </span>
        }
      >
        <div className="table-wrap">
          <table className="table table-compact">
            <thead>
              <tr>
                <th rowSpan={2}>{t('daily.ponds.pond')}</th>
                <th colSpan={4}>{t('daily.ponds.feeding')}</th>
                <th colSpan={2}>{t('daily.ponds.mortality')}</th>
                <th colSpan={2}>{t('daily.healthCondition')}</th>
                <th rowSpan={2} />
              </tr>
              <tr>
                <th className="num">{t('daily.ponds.amount')}</th>
                <th className="num">{t('daily.ponds.rounds')}</th>
                <th>{t('daily.appetite')}</th>
                <th>{t('daily.ponds.tray')}</th>
                <th className="num">pcs</th>
                <th className="num">{t('daily.ponds.weight')}</th>
                <th>{t('daily.ponds.condition')}</th>
                <th>{t('daily.ponds.observation')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.pond.id}>
                  <td className="cell-main">{p.pond.name}</td>
                  <td className="num">{formatNumber(p.feedKg)} kg</td>
                  <td className="num">
                    {p.feedRounds} / {p.feedRoundsPlanned}
                  </td>
                  <td>
                    <span className={cx('status-text', levelClass(appetiteLevel(p.appetite)))}>{t(`appetite.${p.appetite}`)}</span>
                  </td>
                  <td>
                    <span className={cx('status-text', levelClass(trayLevel(p.tray)))}>{t(`tray.${p.tray}`)}</span>
                  </td>
                  <td className="num">{formatNumber(p.mortalityPcs)}</td>
                  <td className="num">{formatNumber(p.mortalityKg, 2)} kg</td>
                  <td>
                    <span className={cx('status-text', `st--${p.health}`)}>{t(`severity.${p.health}`)}</span>
                  </td>
                  <td className="wrap text-secondary" style={{ minWidth: 160, maxWidth: 220 }}>
                    {p.observations.length ? p.observations.map((o) => t(`healthObservation.${o}`)).join(', ') : '—'}
                  </td>
                  <td className="actions">
                    <Link className="btn btn--link" to={`?${new URLSearchParams({ ...Object.fromEntries(params), pond: p.pond.id })}`}>
                      {readOnly ? t('common.view') : t('records.edit')}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td>{report.farm.name}</td>
                <td className="num">{formatNumber(report.totals.feedKg)} kg</td>
                <td />
                <td>{t('daily.ponds.reduced', { count: rows.filter((p) => p.appetite !== 'good').length })}</td>
                <td>{t('daily.ponds.leftover', { count: rows.filter((p) => p.tray !== 'clean').length })}</td>
                <td className="num">{formatNumber(report.totals.mortalityPcs)}</td>
                <td className="num">{formatNumber(report.totals.mortalityKg, 2)} kg</td>
                <td>{t('daily.ponds.noted', { count: rows.filter((p) => p.health !== 'normal').length })}</td>
                <td />
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>

      <div className="grid cols-2">
        {/* 5 Environment / Weather */}
        <section className="card">
          <div className="card-header">
            <h2 className="card-title">
              {t('daily.env.title')} <span className="req">*</span>
            </h2>
            <span className="caption">{t('daily.env.once')}</span>
          </div>
          <div className="card-body form-grid">
            <label className="field">
              <span className="field-label">
                <span>
                  {t('daily.env.weather')} <span className="req">*</span>
                </span>
              </span>
              <select className="select" disabled={readOnly} value={draft.weather ?? ''} onChange={(e) => update({ weather: (e.target.value || null) as S['Weather'] | null })}>
                <option value="">{t('records.select')}</option>
                {WEATHER.map((w) => (
                  <option key={w} value={w}>
                    {t(`weather.${w}`)}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="field-label">{t('daily.env.rainfall')}</span>
              <span className="input-group">
                <input className="input" inputMode="decimal" disabled={readOnly} placeholder="0" value={draft.rainfallMm} onChange={(e) => update({ rainfallMm: e.target.value })} />
                <span className="input-unit">mm</span>
              </span>
            </label>
            <label className="field span-2">
              <span className="field-label">{t('daily.env.events')}</span>
              <input className="input" disabled={readOnly} placeholder={t('daily.env.eventsPlaceholder')} value={draft.events} onChange={(e) => update({ events: e.target.value })} />
            </label>
          </div>
        </section>

        {/* 6 Equipment Status */}
        <Card
          title={t('daily.equipment.title')}
          sub={
            operational.data &&
            t('daily.equipment.sub', {
              aerators: `${operational.data.aerators.on} / ${operational.data.aerators.total}`,
              pumps: `${operational.data.pumps.on} / ${operational.data.pumps.total}`,
              generator: t(`tmDashboard.generatorState.${operational.data.generator.state}`).toLowerCase(),
              tested: operational.data.generator.lastTestedAt ? formatTime(operational.data.generator.lastTestedAt) : '—',
            })
          }
          action={
            <span className="source-tag">
              <Icon icon={Database} />
              {t('daily.equipment.source')}
            </span>
          }
        >
          {(() => {
            const events: (S['EquipmentEvent'] | (ManualEvent & { manual: true }))[] = [
              ...report.equipmentEvents.filter((e) => e.source !== 'manual'),
              ...draft.manualEvents.map((e) => ({ ...e, manual: true as const })),
            ]
            return events.length === 0 ? (
              <div className="empty">
                <span className="empty-title">{t('daily.equipment.none')}</span>
              </div>
            ) : (
              <table className="table table-compact">
                <thead>
                  <tr>
                    <th>{t('daily.equipment.equipment')}</th>
                    <th>{t('daily.equipment.failure')}</th>
                    <th>{t('daily.equipment.action')}</th>
                    <th>{t('daily.equipment.status')}</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((e) => {
                    const pond = 'manual' in e ? pondOptions.find((p) => p.id === e.pondId) : e.pond
                    return (
                      <tr key={'manual' in e ? e.key : e.id}>
                        <td>
                          <div className="cell-main">{e.equipment}</div>
                          {pond && <div className="cell-sub">{pond.name}</div>}
                        </td>
                        <td>
                          <div className="wrap">{e.failure}</div>
                          <div className="cell-sub">{formatRecentTime(e.occurredAt)}</div>
                        </td>
                        <td className="wrap">{e.action ?? '—'}</td>
                        <td>
                          <span className={cx('status-text', e.status === 'resolved' ? 'st--resolved' : 'st--progress')}>{t(`daily.equipment.${e.status}`)}</span>
                          {'manual' in e && !readOnly && (
                            <button type="button" className="btn btn--link btn--sm" onClick={() => setEventEdit(e)}>
                              {t('records.edit')}
                            </button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )
          })()}
          {!readOnly && (
            <div className="card-footer" style={{ justifyContent: 'flex-start' }}>
              <button type="button" className="btn btn--link" onClick={() => setEventEdit('new')}>
                <Icon icon={Plus} />
                {t('daily.equipment.add')}
              </button>
            </div>
          )}
        </Card>
      </div>

      {/* 7 Major Alerts / Issues */}
      <Card
        title={t('daily.alerts.title')}
        sub={t('daily.alerts.sub')}
        action={
          <span className="source-tag">
            <Icon icon={Bell} />
            {t('daily.alerts.source')}
          </span>
        }
      >
        {report.alerts.length === 0 ? (
          <div className="empty">
            <span className="empty-title">{t('daily.alerts.none')}</span>
          </div>
        ) : (
          <div className="table-wrap">
          <table className="table table-compact">
            <thead>
              <tr>
                <th style={{ width: 32 }} />
                <th>{t('daily.ponds.pond')}</th>
                <th>{t('pondAlerts.alert')}</th>
                <th>{t('pondAlerts.severity')}</th>
                <th>{t('pondAlerts.occurred')}</th>
                <th>{t('alertDrawer.duration')}</th>
                <th>{t('daily.alerts.handling')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {sortedAlerts.map((a) => {
                const on = !draft.excludedAlertIds.includes(a.id)
                return (
                  <tr key={a.id} className={cx(!on && 'is-muted')}>
                    <td>
                      <Check
                        checked={on}
                        disabled={readOnly}
                        label={t('daily.alerts.include', { id: a.id })}
                        onChange={(v) => update({ excludedAlertIds: v ? draft.excludedAlertIds.filter((x) => x !== a.id) : [...draft.excludedAlertIds, a.id] })}
                      />
                    </td>
                    <td className="cell-main">{a.pond.name}</td>
                    <td className="wrap">
                      <div>{alertName(a, t)}</div>
                      <div className="cell-sub">{a.id}</div>
                    </td>
                    <td>
                      <StatusMark severity={a.severity} />
                    </td>
                    <td>{formatRecentTime(a.occurredAt)}</td>
                    <td>
                      {formatDuration(a.occurredAt, new Date(Date.parse(a.occurredAt) + a.durationMinutes * 60_000))} ·{' '}
                      {a.resolvedAt ? t('alertDrawer.resolved') : t('alertDrawer.ongoing')}
                    </td>
                    <td>
                      <AlertStateText state={a.state} />
                    </td>
                    <td className="actions">
                      <Link className="btn btn--link" to={`/tm/ponds/${a.pond.id}?tab=alerts&alert=${a.id}`}>
                        {t('daily.alerts.viewAlert')}
                      </Link>
                      <Link className="btn btn--link" to={`/tm/ponds/${a.pond.id}?tab=iot${isSensorParameter(a.parameter) ? `&param=${a.parameter}` : ''}`}>
                        {t('daily.alerts.viewData')}
                      </Link>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          </div>
        )}
      </Card>

      {/* 8 Actions Taken */}
      <Card title={t('daily.actions.title')} sub={t('daily.actions.sub')}>
        {(() => {
          const actions = [
            ...report.actions.filter((a) => a.source !== 'manual').map((a) => ({ ...a, key: a.id, pondName: a.pond?.name ?? null, manual: null as ManualAction | null })),
            ...draft.manualActions.map((m) => ({ key: m.key, at: m.at, source: 'manual' as const, pondName: pondOptions.find((p) => p.id === m.pondId)?.name ?? null, action: m.action, outcome: m.outcome, manual: m })),
          ].sort((a, b) => a.at.localeCompare(b.at))
          return actions.length === 0 ? (
            <div className="empty">
              <span className="empty-title">{t('daily.actions.none')}</span>
            </div>
          ) : (
            <table className="table table-compact">
              <thead>
                <tr>
                  <th>{t('daily.time')}</th>
                  <th>{t('daily.ponds.pond')}</th>
                  <th>{t('daily.actions.action')}</th>
                  <th>{t('daily.actions.outcome')}</th>
                  <th>{t('daily.actions.source')}</th>
                </tr>
              </thead>
              <tbody>
                {actions.map((a) => (
                  <tr key={a.key}>
                    <td className="text-muted">{formatRecentTime(a.at)}</td>
                    <td>{a.pondName ?? t('daily.farmWide')}</td>
                    <td className="wrap">{a.action}</td>
                    <td className="wrap">{a.outcome ?? '—'}</td>
                    <td>
                      <span className="source-tag">{t(`daily.actions.sources.${a.source}`)}</span>
                      {a.manual && !readOnly && (
                        <button type="button" className="btn btn--link btn--sm" onClick={() => setActionEdit(a.manual)}>
                          {t('records.edit')}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        })()}
        {!readOnly && (
          <div className="card-footer" style={{ justifyContent: 'flex-start' }}>
            <button type="button" className="btn btn--link" onClick={() => setActionEdit('new')}>
              <Icon icon={Plus} />
              {t('daily.actions.add')}
            </button>
          </div>
        )}
      </Card>

      {/* 9 Technical Manager Summary */}
      <section className="card">
        <div className="card-header">
          <div>
            <h2 className="card-title">
              {t('daily.summary.title')} <span className="req">*</span>
            </h2>
            <div className="card-sub">{t('daily.summary.sub')}</div>
          </div>
        </div>
        <div className="card-body">
          <textarea
            className="textarea"
            style={{ minHeight: 120 }}
            aria-label={t('daily.summary.title')}
            disabled={readOnly}
            placeholder={t('daily.summary.placeholder')}
            value={draft.summary}
            onChange={(e) => update({ summary: e.target.value })}
          />
        </div>
      </section>

      {!readOnly && (
        <div className="action-bar">
          <div className="action-bar-status">
            <ReportStateText state="draft" />
            <span>
              {missing.length ? t('daily.bar.missing', { pct: ready, items: missingText }) : t('daily.bar.ready', { pct: ready })}
              {/* "Last saved" is already in the page header — the bar only flags unsaved work (wireframe) */}
              {(save.isPending || dirty) && ` · ${save.isPending ? t('daily.bar.saving') : t('daily.bar.unsaved')}`}
            </span>
            {save.isError && <span className="helper is-error">{t('daily.bar.saveFailed')}</span>}
          </div>
          <span className="action-bar-spacer" />
          <button type="button" className="btn btn--outline" disabled={save.isPending || !dirty} onClick={() => saveDraft()}>
            <Icon icon={Save} />
            {t('daily.saveDraft')}
          </button>
          <button type="button" className="btn btn--primary" onClick={() => (submit.reset(), setConfirm(true))}>
            <Icon icon={Send} />
            {t('daily.submit')}
          </button>
        </div>
      )}

      {confirm && (
        <ConfirmDialog
          title={t('daily.confirm.title', { date: formatCalendarDate(report.date!) })}
          confirmLabel={t('daily.submit')}
          busy={missing.length > 0 || submit.isPending || save.isPending}
          onCancel={() => setConfirm(false)}
          onConfirm={doSubmit}
        >
          <p className="text-muted">{t('daily.confirm.body')}</p>
          {missing.length > 0 ? (
            <div className="notice notice--warning" role="alert">
              <Icon icon={TriangleAlert} />
              <span>{t('daily.confirm.missing', { items: missingText })}</span>
            </div>
          ) : (
            <div className="notice">
              <Icon icon={Info} />
              <span>{t('daily.confirm.after')}</span>
            </div>
          )}
          {submit.isError && (
            <div className="notice notice--warning" role="alert">
              <Icon icon={TriangleAlert} />
              <span>{t('daily.confirm.failed')}</span>
            </div>
          )}
        </ConfirmDialog>
      )}

      {pondRow && (
        <PondDrawer
          key={pondRow.pond.id}
          date={report.date!}
          row={pondRow}
          readOnly={readOnly}
          value={draft.ponds[pondRow.pond.id]}
          onClose={closePond}
          onSave={(v) => {
            update({ ponds: { ...draft.ponds, [pondRow.pond.id]: v } })
            closePond()
          }}
        />
      )}
      {actionEdit && (
        <ActionDrawer
          date={report.date!}
          ponds={pondOptions}
          value={actionEdit === 'new' ? null : actionEdit}
          onClose={() => setActionEdit(null)}
          onRemove={() => {
            update({ manualActions: draft.manualActions.filter((a) => a !== actionEdit) })
            setActionEdit(null)
          }}
          onSave={(a) => {
            update({ manualActions: actionEdit === 'new' ? [...draft.manualActions, a] : draft.manualActions.map((x) => (x === actionEdit ? a : x)) })
            setActionEdit(null)
          }}
        />
      )}
      {eventEdit && (
        <EquipmentDrawer
          date={report.date!}
          ponds={pondOptions}
          value={eventEdit === 'new' ? null : eventEdit}
          onClose={() => setEventEdit(null)}
          onRemove={() => {
            update({ manualEvents: draft.manualEvents.filter((e) => e !== eventEdit) })
            setEventEdit(null)
          }}
          onSave={(e) => {
            update({ manualEvents: eventEdit === 'new' ? [...draft.manualEvents, e] : draft.manualEvents.map((x) => (x === eventEdit ? e : x)) })
            setEventEdit(null)
          }}
        />
      )}
    </div>
  )
}
