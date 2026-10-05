import { ArrowRight, Bell, Database, Info, Plus, Save, Scale, Send, TrendingDown, TrendingUp, TriangleAlert, type LucideIcon } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { useSaveWeeklyReport, useSubmitReport } from '@/api/queries/reports'
import type { components } from '@/api/schema'
import type { Severity } from '@/api/types'
import { Donut, GrowthVsTargetChart } from '@/components/Charts'
import { ConfirmDialog } from '@/components/Controls'
import { DateField } from '@/components/DateField'
import { Drawer } from '@/components/Drawer'
import { Icon } from '@/components/Icon'
import { Kpi } from '@/components/Kpi'
import { Card } from '@/components/Page'
import { AlertStateText, ReportStateText, StatusMark } from '@/components/StatusMark'
import { cx } from '@/lib/cx'
import { formatCalendarDate, formatDayTime, formatDue, formatDuration, formatNumber, formatRecentTime, formatSignedPct, formatWeek } from '@/lib/format'
import { WeeklyPondsCard } from './WeeklyPonds'

type S = components['schemas']
type WeeklyReport = S['WeeklyReport']
type Note = { cause: string; action: string; outcome: string }
type MajorAction = { key: string; id?: string; date: string; pondId: string | null; action: string }
type Draft = { farmCondition: Severity; notes: Record<string, Note>; actions: MajorAction[]; wqComment: string; summary: string }

const SEVERITIES: Severity[] = ['normal', 'attention', 'warning', 'critical']
const AUTOSAVE_MS = 30_000
let seq = 0

const toDraft = (r: WeeklyReport): Draft => ({
  farmCondition: r.summary.farmCondition,
  notes: Object.fromEntries(r.alerts.map((a) => [a.id, { cause: a.cause ?? '', action: a.action ?? '', outcome: a.outcome ?? '' }])),
  actions: r.majorActions.map((a) => ({ key: a.id, id: a.id, date: a.date, pondId: a.pond?.id ?? null, action: a.action })),
  wqComment: r.waterQualityComment ?? '',
  summary: r.technicalSummary ?? '',
})

const toInput = (d: Draft): S['WeeklyReportInput'] => ({
  farmCondition: d.farmCondition,
  alertNotes: Object.entries(d.notes).map(([alertId, n]) => ({ alertId, cause: n.cause.trim() || null, action: n.action.trim() || null, outcome: n.outcome.trim() || null })),
  majorActions: d.actions.map(({ id, date, pondId, action }) => ({ id, date, pondId, action })),
  waterQualityComment: d.wqComment.trim() || null,
  technicalSummary: d.summary.trim() || null,
})

/**
 * TM-05 Weekly Report — Create / Edit (05 §5 TM-05 = FM-06 layout; prototype screens/tm-weekly-report.html).
 * Production, weekly totals, water-quality trends and alerts are aggregated by the backend; the TM confirms the
 * Farm condition and adds comments, alert notes, major actions and the weekly summary. `readOnly` renders FM-06.
 */
export function WeeklyEditor({ report, readOnly: forceReadOnly, onToast }: { report: WeeklyReport; readOnly?: boolean; onToast?: (m: string, d?: string) => void }) {
  const { t } = useTranslation()
  const readOnly = forceReadOnly || report.status === 'submitted'
  const [draft, setDraft] = useState<Draft>(() => toDraft(report))
  const [dirty, setDirty] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const [noteFor, setNoteFor] = useState<string | null>(null)
  const [actionEdit, setActionEdit] = useState<MajorAction | 'new' | null>(null)
  const save = useSaveWeeklyReport(report.id)
  const submit = useSubmitReport(report.id)
  const period = formatWeek(report.weekStart!, report.weekEnd!)

  const update = (patch: Partial<Draft>) => {
    setDraft((d) => ({ ...d, ...patch }))
    setDirty(true)
  }
  const draftRef = useRef(draft)
  useEffect(() => {
    draftRef.current = draft
  }, [draft])
  const saveDraft = useCallback((onSaved?: () => void) => {
    const sent = draftRef.current
    // Typing during the request keeps the draft unsaved (it goes out with the next autosave)
    save.mutate(toInput(sent), { onSuccess: () => (draftRef.current === sent && setDirty(false), onSaved?.()) })
  }, [save])
  useEffect(() => {
    if (!dirty || readOnly) return
    const timer = setTimeout(() => saveDraft(), AUTOSAVE_MS)
    return () => clearTimeout(timer)
  }, [dirty, draft, readOnly, saveDraft])

  const missingSummary = !draft.summary.trim()
  const labPending = report.pondsThisWeek.filter((p) => p.laboratory.pending)
  const doSubmit = () => {
    const run = () =>
      submit.mutate(undefined, {
        onSuccess: () => {
          setConfirm(false)
          onToast?.(t('weekly.submitted'), t('daily.submittedDetail', { date: period }))
        },
      })
    if (dirty) saveDraft(run)
    else run()
  }

  const s = report.summary
  const k = report.production.kpis
  const prev = k.previous
  const behind = report.production.ponds.filter((p) => p.growth === 'behind')
  const cov = report.samplingCoverage
  const pondOptions = report.pondsThisWeek.map((p) => p.pond)
  const diff = (now: number, before: number | undefined, digits: number, unit = '') => {
    if (before === undefined) return { text: undefined, icon: undefined }
    const d = Math.round((now - before) * 10 ** digits) / 10 ** digits
    const sign = d > 0 ? '+' : d < 0 ? '−' : '±'
    return { text: t('weekly.vsPrevious', { value: `${sign}${formatNumber(Math.abs(d), digits)}${unit}` }), icon: (d >= 0 ? TrendingUp : TrendingDown) as LucideIcon }
  }
  const biomassDiff = diff(k.biomassKg / 1000, prev?.biomassKg === undefined ? undefined : prev.biomassKg / 1000, 1, ' t')
  const srDiff = diff(k.survivalRatePct, prev?.survivalRatePct, 0, ' pt')
  const fcrDiff = diff(k.fcr, prev?.fcr, 2)

  return (
    <div className="stack" style={{ gap: 24 }}>
      {readOnly && !forceReadOnly && (
        <div className="notice">
          <Icon icon={Info} />
          <span>{t('daily.readOnly', { time: report.submittedAt ? formatDayTime(report.submittedAt) : '' })}</span>
        </div>
      )}

      {/* 1–2 Summary */}
      {readOnly ? (
        <section className="card">
          <div className="card-body">
            <dl className="dl" style={{ gridTemplateColumns: 'repeat(5,minmax(0,1fr))' }}>
              <div>
                <dt>{t('weekly.ro.condition')}</dt>
                <dd>
                  <StatusMark severity={s.farmCondition} />
                </dd>
              </div>
              <div>
                <dt>{t('weekly.summary.behind')}</dt>
                <dd>
                  {t('weekly.summary.of', { n: s.pondsBehind, total: s.pondsTotal })}
                  {behind.length > 0 && ` (${behind.map((p) => p.pond.name.replace('Pond ', '')).join(', ')})`}
                </dd>
              </div>
              <div>
                <dt>{t('weekly.summary.feed')}</dt>
                <dd className="num">
                  {formatNumber(s.feedKg)} kg
                  {report.feeding.previousTotal ? ` (${formatSignedPct((s.feedKg / report.feeding.previousTotal - 1) * 100)})` : ''}
                </dd>
              </div>
              <div>
                <dt>{t('weekly.summary.mortality')}</dt>
                <dd className="num">{`${formatNumber(s.mortalityPcs)} pcs · ${formatNumber(s.mortalityKg, 1)} kg`}</dd>
              </div>
              <div>
                <dt>{t('weekly.summary.alerts')}</dt>
                <dd>{s.alertsOngoing ? t('weekly.summary.alertsValue', { count: s.alertCount, ongoing: s.alertsOngoing }) : t('weekly.ro.allResolved', { count: s.alertCount })}</dd>
              </div>
            </dl>
          </div>
        </section>
      ) : (
      <section className="card">
        <div className="card-header">
          <h2 className="card-title">{t('weekly.summary.title')}</h2>
          <span className="source-tag">
            <Icon icon={Database} />
            {t('weekly.fromRecords')}
          </span>
        </div>
        <div className="card-body form-grid-4" style={{ gridTemplateColumns: 'repeat(5,minmax(0,1fr))' }}>
          <label className="field">
            <span className="field-label">
              <span>
                {t('weekly.summary.condition')} <span className="req">*</span>
              </span>
            </span>
            <select className="select" disabled={readOnly} value={draft.farmCondition} onChange={(e) => update({ farmCondition: e.target.value as Severity })}>
              {SEVERITIES.map((sev) => (
                <option key={sev} value={sev}>
                  {t(`severity.${sev}`)}
                </option>
              ))}
            </select>
          </label>
          <ReadOnlyField label={t('weekly.summary.behind')} value={t('weekly.summary.of', { n: s.pondsBehind, total: s.pondsTotal })} />
          <ReadOnlyField label={t('weekly.summary.feed')} value={`${formatNumber(s.feedKg)} kg`} />
          <ReadOnlyField label={t('weekly.summary.mortality')} value={`${formatNumber(s.mortalityPcs)} pcs · ${formatNumber(s.mortalityKg, 1)} kg`} />
          <ReadOnlyField label={t('weekly.summary.alerts')} value={t('weekly.summary.alertsValue', { count: s.alertCount, ongoing: s.alertsOngoing })} />
        </div>
      </section>
      )}

      {/* 3 Production Status */}
      <section className="stack">
        <div className="row-between">
          <h2 className="section-label">{t('weekly.production.title')}</h2>
          {readOnly && cov.date && <span className="caption">{t('weekly.ro.productionCaption', { date: formatCalendarDate(cov.date) })}</span>}
          {!readOnly && cov.date && (
            <span className="source-tag">
              <Icon icon={Database} />
              {t('weekly.production.source', { date: formatCalendarDate(cov.date) })}
            </span>
          )}
        </div>
        {!readOnly && cov.date && (
          <div className="notice">
            <Icon icon={Scale} />
            <span>
              <b>{t('weekly.production.coverage', { date: formatCalendarDate(cov.date), sampled: cov.sampled, total: cov.total, lab: cov.labReceived })}</b>{' '}
              {!readOnly && <Link to="/tm/ponds?sampling=1">{t('weekly.production.record')}</Link>}
            </span>
          </div>
        )}
        <div className="grid kpis gap-4">
          <Kpi name={t('weekly.kpi.biomass')} type={t('valueType.estimated')} value={formatNumber(k.biomassKg / 1000, 1)} unit="t" compare={biomassDiff.text} compareIcon={biomassDiff.icon} basis={t('weekly.kpi.biomassBasis', { count: s.pondsTotal })} />
          <Kpi name={t('weekly.kpi.sr')} type={t('valueType.estimated')} value={formatNumber(k.survivalRatePct)} unit="%" compare={srDiff.text} compareIcon={srDiff.icon} basis={t('weekly.kpi.srBasis')} />
          <Kpi name={t('weekly.kpi.fcr')} type={t('valueType.actual')} value={formatNumber(k.fcr, 2)} compare={fcrDiff.text} compareIcon={fcrDiff.icon} basis={t('weekly.kpi.fcrBasis')} />
          <Kpi
            name={t('weekly.kpi.growth')}
            type={t('valueType.actual')}
            value={`${k.growthDistribution.onTrack + k.growthDistribution.ahead} / ${s.pondsTotal}`}
            unit={t('weekly.kpi.onTrack')}
            compare={behind.length ? t('weekly.kpi.behind', { count: behind.length, ponds: behind.map((p) => p.pond.name.replace('Pond ', '')).join(', ') }) : t('weekly.kpi.noneBehind')}
            compareIcon={behind.length ? TriangleAlert : undefined}
            basis={cov.date ? t('weekly.kpi.growthBasis', { date: formatCalendarDate(cov.date), sampled: cov.sampled, total: cov.total }) : undefined}
          />
        </div>
      </section>

      <div className="grid cols-2">
        <Card title={t('weekly.growthChart.title')} sub={cov.date ? t('weekly.growthChart.sub', { date: formatCalendarDate(cov.date) }) : undefined}>
          <div className="card-body">
            <GrowthVsTargetChart
              curve={report.production.growthCurve}
              points={report.production.ponds
                .filter((p) => p.doc !== null && p.abwG !== null)
                .map((p) => ({ doc: p.doc!, abw: p.abwG!, label: p.pond.name.replace('Pond ', 'P'), behind: p.growth === 'behind' }))}
            />
          </div>
        </Card>
        <Card
          title={t('weekly.donuts.title')}
          sub={t('weekly.donuts.sub')}
          action={
            !readOnly && (
              <span className="source-tag">
                <Icon icon={Database} />
                {t('weekly.fromRecords')}
              </span>
            )
          }
        >
          <div className="card-body">
            <div className="subsection-title">{t('weekly.donuts.feeding')}</div>
            <Donut palette="feed" unit="kg" caption={t('weekly.donuts.caption', { unit: 'kg' })} items={report.feeding.byPond.map((p) => ({ name: p.pond.name, value: p.value }))} />
          </div>
          <div className="card-body" style={{ borderTop: '1px solid var(--color-border)' }}>
            <div className="subsection-title">{t('weekly.donuts.mortality')}</div>
            <Donut palette="mortality" unit="pcs" caption={t('weekly.donuts.caption', { unit: 'pcs' })} items={report.mortality.byPond.map((p) => ({ name: p.pond.name, value: p.value }))} />
          </div>
        </Card>
      </div>

      {/* 5 Ponds this week */}
      <WeeklyPondsCard report={report} readOnly={readOnly} comment={draft.wqComment} onComment={(wqComment) => update({ wqComment })} />

      {/* 6 Major Alerts / Issues */}
      <Card
        title={t('daily.alerts.title')}
        sub={readOnly ? t('weekly.ro.alertsSub') : t('weekly.alerts.sub')}
        action={
          <span className="source-tag">
            <Icon icon={Bell} />
            {t('daily.alerts.source')}
          </span>
        }
      >
        <table className="table table-compact">
          <thead>
            <tr>
              <th>{t('pondAlerts.alert')}</th>
              <th>{t('pondAlerts.severity')}</th>
              <th>{t('pondAlerts.occurred')}</th>
              <th>{t('alertDrawer.duration')}</th>
              <th>{t('daily.history.status')}</th>
              <th>{t('weekly.alerts.notes')}</th>
            </tr>
          </thead>
          <tbody>
            {report.alerts.map((a) => {
              const n = draft.notes[a.id]
              const filled = n && (n.cause || n.action || n.outcome)
              return (
                <tr key={a.id}>
                  <td>
                    <div className="cell-main">{a.title}</div>
                    <div className="cell-sub">{a.pond.name}</div>
                  </td>
                  <td>
                    <StatusMark severity={a.severity} />
                  </td>
                  <td>{formatDayTime(a.occurredAt)}</td>
                  <td>
                    {formatDuration(a.occurredAt, new Date(Date.parse(a.occurredAt) + a.durationMinutes * 60_000))}
                    {!a.resolvedAt && ` · ${t('alertDrawer.ongoing')}`}
                  </td>
                  <td>
                    <AlertStateText state={a.state} />
                  </td>
                  <td className="wrap" style={{ minWidth: 160, maxWidth: 260 }}>
                    {filled && [n.cause, n.action, n.outcome].map((x) => x.trim() || '—').join(' · ')}
                    {!readOnly && (
                      <button type="button" className="btn btn--link" onClick={() => setNoteFor(a.id)}>
                        {filled ? t('records.edit') : t('weekly.alerts.addNote')}
                      </button>
                    )}
                    {readOnly && !filled && <span className="text-muted">—</span>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {report.alerts.length === 0 && (
          <div className="empty">
            <span className="empty-title">{t('daily.alerts.none')}</span>
          </div>
        )}
      </Card>

      {/* 7 Major Actions */}
      <Card title={t('weekly.actions.title')}>
        {readOnly ? (
          <div className="card-body">
            {draft.actions.length === 0 ? (
              <span className="text-muted">—</span>
            ) : (
              <ul className="bullets">
                {[...draft.actions]
                  .sort((a, b) => a.date.localeCompare(b.date))
                  .map((a) => (
                    <li key={a.key}>
                      {formatCalendarDate(a.date)} — {[pondOptions.find((p) => p.id === a.pondId)?.name, a.action].filter(Boolean).join(' ')}
                    </li>
                  ))}
              </ul>
            )}
          </div>
        ) : draft.actions.length === 0 ? (
          <div className="empty">
            <span className="empty-title">{t('daily.actions.none')}</span>
          </div>
        ) : (
          <table className="table table-compact">
            <tbody>
              {[...draft.actions]
                .sort((a, b) => a.date.localeCompare(b.date))
                .map((a) => (
                  <tr key={a.key}>
                    <td className="text-muted">{formatCalendarDate(a.date)}</td>
                    <td>{pondOptions.find((p) => p.id === a.pondId)?.name ?? t('daily.farmWide')}</td>
                    <td className="wrap">{a.action}</td>
                    {!readOnly && (
                      <td className="actions">
                        <button type="button" className="btn btn--link btn--sm" onClick={() => setActionEdit(a)}>
                          {t('records.edit')}
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
            </tbody>
          </table>
        )}
        {!readOnly && (
          <div className="card-footer" style={{ justifyContent: 'flex-start' }}>
            <button type="button" className="btn btn--link" onClick={() => setActionEdit('new')}>
              <Icon icon={Plus} />
              {t('daily.actions.add')}
            </button>
          </div>
        )}
      </Card>

      {/* 8 Weekly Technical Summary */}
      {readOnly ? (
        <section className="card">
          <div className="card-header">
            <h2 className="card-title">{t('weekly.summaryText.title')}</h2>
            <span className="caption">— {report.technicalManager.name}</span>
          </div>
          <div className="card-body">
            <div className="prose">
              <p>{report.technicalSummary ?? '—'}</p>
            </div>
          </div>
        </section>
      ) : (
      <section className="card">
        <div className="card-header">
          <h2 className="card-title">
            {t('weekly.summaryText.title')} <span className="req">*</span>
          </h2>
        </div>
        <div className="card-body">
          <textarea
            className="textarea"
            style={{ minHeight: 140 }}
            aria-label={t('weekly.summaryText.title')}
            disabled={readOnly}
            placeholder={t('weekly.summaryText.placeholder')}
            value={draft.summary}
            onChange={(e) => update({ summary: e.target.value })}
          />
        </div>
      </section>
      )}

      {!readOnly && (
        <div className="action-bar">
          <div className="action-bar-status">
            <ReportStateText state="draft" />
            <span>
              {save.isPending
                ? t('daily.bar.saving')
                : dirty
                  ? t('daily.bar.unsaved')
                  : report.savedAt
                    ? t('weekly.bar.saved', { time: formatRecentTime(report.savedAt) })
                    : t('daily.bar.notSaved')}
              {' · '}
              {t('weekly.bar.due', { due: formatDue(report.dueAt) })}
              {missingSummary && ` · ${t('weekly.bar.summaryMissing')}`}
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
          title={t('weekly.confirm.title', { period })}
          confirmLabel={t('daily.submit')}
          busy={missingSummary || submit.isPending || save.isPending}
          onCancel={() => setConfirm(false)}
          onConfirm={doSubmit}
        >
          <p className="text-muted">
            {t('daily.confirm.body')}
            {labPending.length > 0 && ` ${t('weekly.confirm.labPending', { ponds: labPending.map((p) => p.pond.name).join(', ') })}`}
          </p>
          {missingSummary && (
            <div className="notice notice--warning" role="alert">
              <Icon icon={TriangleAlert} />
              <span>{t('weekly.confirm.missing')}</span>
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

      {noteFor && (
        <NoteDrawer
          alert={report.alerts.find((a) => a.id === noteFor)!}
          value={draft.notes[noteFor] ?? { cause: '', action: '', outcome: '' }}
          onClose={() => setNoteFor(null)}
          onSave={(n) => {
            update({ notes: { ...draft.notes, [noteFor]: n } })
            setNoteFor(null)
          }}
        />
      )}
      {actionEdit && (
        <MajorActionDrawer
          period={period}
          ponds={pondOptions}
          value={actionEdit === 'new' ? null : actionEdit}
          defaultDate={report.weekEnd!}
          onClose={() => setActionEdit(null)}
          onRemove={() => {
            update({ actions: draft.actions.filter((a) => a !== actionEdit) })
            setActionEdit(null)
          }}
          onSave={(a) => {
            update({ actions: actionEdit === 'new' ? [...draft.actions, a] : draft.actions.map((x) => (x === actionEdit ? a : x)) })
            setActionEdit(null)
          }}
        />
      )}
    </div>
  )
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <div className="field">
      <span className="field-label">{label}</span>
      <div className="input is-readonly">{value}</div>
    </div>
  )
}

function NoteDrawer({ alert, value, onSave, onClose }: { alert: WeeklyReport['alerts'][number]; value: Note; onSave: (n: Note) => void; onClose: () => void }) {
  const { t } = useTranslation()
  const [n, setN] = useState(value)
  return (
    <Drawer
      caption={`${alert.id} · ${alert.pond.name}`}
      title={alert.title}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn--outline" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button type="button" className="btn btn--primary" onClick={() => onSave(n)}>
            {t('daily.apply')}
          </button>
        </>
      }
    >
      {(['cause', 'action', 'outcome'] as const).map((f) => (
        <label key={f} className="field">
          <span className="field-label">{t(`weekly.alerts.${f}`)}</span>
          <input className="input" value={n[f]} onChange={(e) => setN({ ...n, [f]: e.target.value })} />
        </label>
      ))}
      <Link className="btn btn--link" to={`/tm/ponds/${alert.pond.id}?tab=alerts`} style={{ alignSelf: 'flex-start' }}>
        {t('weekly.alerts.openPond', { pond: alert.pond.name })}
        <Icon icon={ArrowRight} />
      </Link>
    </Drawer>
  )
}

function MajorActionDrawer({
  period,
  ponds,
  value,
  defaultDate,
  onSave,
  onRemove,
  onClose,
}: {
  period: string
  ponds: { id: string; name: string }[]
  value: MajorAction | null
  defaultDate: string
  onSave: (a: MajorAction) => void
  onRemove: () => void
  onClose: () => void
}) {
  const { t } = useTranslation()
  const [date, setDate] = useState(value?.date ?? defaultDate)
  const [pondId, setPondId] = useState(value?.pondId ?? '')
  const [action, setAction] = useState(value?.action ?? '')
  const [tried, setTried] = useState(false)
  const save = () => {
    setTried(true)
    if (!action.trim()) return
    onSave({ key: value?.key ?? `wa-${++seq}`, id: value?.id, date, pondId: pondId || null, action: action.trim() })
  }
  return (
    <Drawer
      caption={t('weekly.drawerCaption', { period })}
      title={value ? t('daily.actions.edit') : t('daily.actions.add')}
      onClose={onClose}
      footer={
        <>
          {value && (
            <button type="button" className="btn btn--outline" onClick={onRemove}>
              {t('daily.remove')}
            </button>
          )}
          <button type="button" className="btn btn--outline" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button type="button" className="btn btn--primary" onClick={save}>
            {t('daily.apply')}
          </button>
        </>
      }
    >
      <div className="form-grid">
        <div className="field">
          <span className="field-label">{t('records.date')}</span>
          <DateField value={date} onChange={setDate} />
        </div>
        <label className="field">
          <span className="field-label">{t('daily.pondField')}</span>
          <select className="select" value={pondId} onChange={(e) => setPondId(e.target.value)}>
            <option value="">{t('daily.farmWide')}</option>
            {ponds.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field span-2">
          <span className="field-label">
            <span>
              {t('daily.actions.action')} <span className="req">*</span>
            </span>
          </span>
          <input className={cx('input', tried && !action.trim() && 'is-error')} value={action} onChange={(e) => setAction(e.target.value)} />
        </label>
      </div>
    </Drawer>
  )
}
