import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { isApiError } from '@/api/client'
import { useRules, useSaveRules } from '@/api/queries/admin'
import type { components } from '@/api/schema'
import { QueryState } from '@/components/QueryState'
import { cx } from '@/lib/cx'
import { formatDate } from '@/lib/format'
import { SaveDialog } from './SaveDialog'

type S = components['schemas']
type Input = S['RuleSettingsInput']
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/
const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7]

/** Rules (AD-S-003): report deadlines, data freshness, Attention → Alert time, Farm Production Status boundaries (04 §7–§8). */
export function RulesTab({ onDone }: { onDone: (message: string) => void }) {
  const rules = useRules()
  return <QueryState query={rules}>{(data) => <RulesEditor key={data.updatedAt} settings={data} onDone={onDone} />}</QueryState>
}

type Draft = Record<keyof Input, string>
const toDraft = (r: S['RuleSettings']): Draft => ({
  dailyReportDue: r.dailyReportDue,
  weeklyReportDueWeekday: String(r.weeklyReportDueWeekday),
  weeklyReportDueTime: r.weeklyReportDueTime,
  sensorDelayedAfterMinutes: String(r.sensorDelayedAfterMinutes),
  sensorOfflineAfterMinutes: String(r.sensorOfflineAfterMinutes),
  attentionToAlertMinutes: String(r.attentionToAlertMinutes),
  productionAttentionPct: String(r.productionAttentionPct),
  productionWarningPct: String(r.productionWarningPct),
})
const int = (v: string) => (/^\d+$/.test(v.trim()) ? Number(v) : NaN)

function RulesEditor({ settings, onDone }: { settings: S['RuleSettings']; onDone: (message: string) => void }) {
  const { t } = useTranslation()
  const save = useSaveRules()
  const initial = toDraft(settings)
  const [d, setD] = useState<Draft>(initial)
  const [confirming, setConfirming] = useState(false)
  const set = (key: keyof Draft) => (value: string) => setD((x) => ({ ...x, [key]: value }))

  const positive = (v: string) => (int(v) > 0 ? undefined : t('adSettings.rules.wholeNumber'))
  const pct = (v: string) => (int(v) > 0 && int(v) <= 100 ? undefined : t('adSettings.rules.percent'))
  const errors: Partial<Record<keyof Draft, string>> = {
    dailyReportDue: TIME.test(d.dailyReportDue) ? undefined : t('adSettings.rules.time'),
    weeklyReportDueTime: TIME.test(d.weeklyReportDueTime) ? undefined : t('adSettings.rules.time'),
    sensorDelayedAfterMinutes: positive(d.sensorDelayedAfterMinutes),
    sensorOfflineAfterMinutes:
      positive(d.sensorOfflineAfterMinutes) ??
      (int(d.sensorOfflineAfterMinutes) > int(d.sensorDelayedAfterMinutes) ? undefined : t('adSettings.rules.offlineAfter', { minutes: d.sensorDelayedAfterMinutes })),
    attentionToAlertMinutes: positive(d.attentionToAlertMinutes),
    productionAttentionPct: pct(d.productionAttentionPct),
    productionWarningPct:
      pct(d.productionWarningPct) ?? (int(d.productionWarningPct) > int(d.productionAttentionPct) ? undefined : t('adSettings.rules.warningAfter', { pct: d.productionAttentionPct })),
  }
  const hasErrors = Object.values(errors).some(Boolean)
  const dirty = JSON.stringify(d) !== JSON.stringify(initial)
  const send = () =>
    save.mutate(
      {
        dailyReportDue: d.dailyReportDue,
        weeklyReportDueWeekday: int(d.weeklyReportDueWeekday),
        weeklyReportDueTime: d.weeklyReportDueTime,
        sensorDelayedAfterMinutes: int(d.sensorDelayedAfterMinutes),
        sensorOfflineAfterMinutes: int(d.sensorOfflineAfterMinutes),
        attentionToAlertMinutes: int(d.attentionToAlertMinutes),
        productionAttentionPct: int(d.productionAttentionPct),
        productionWarningPct: int(d.productionWarningPct),
      },
      { onSuccess: () => (setConfirming(false), onDone(t('adSettings.rules.saved'))), onError: () => setConfirming(false) },
    )

  const field = (key: keyof Draft, label: string, unit: string, helper?: string, span2?: boolean) => (
    <label className={cx('field', span2 && 'span-2')}>
      <span className="field-label">
        <span>
          {label} <span className="req">*</span>
        </span>
      </span>
      <span className="input-group">
        <input className={cx('input', errors[key] && 'is-error')} value={d[key]} onChange={(e) => set(key)(e.target.value)} />
        <span className="input-unit">{unit}</span>
      </span>
      {(errors[key] || helper) && <span className={cx('helper', errors[key] && 'is-error')}>{errors[key] ?? helper}</span>}
    </label>
  )
  const card = (title: string, sub: string | null, body: ReactNode) => (
    <section className="card">
      <div className="card-header">
        <div>
          <h2 className="card-title">{title}</h2>
          {sub && <div className="card-sub">{sub}</div>}
        </div>
      </div>
      <div className="card-body form-grid">{body}</div>
    </section>
  )

  return (
    <div className="stack" style={{ gap: 24 }}>
      <div className="grid cols-2">
        {card(
          t('adSettings.rules.deadlines'),
          t('adSettings.rules.deadlinesSub'),
          <>
            {field('dailyReportDue', t('adSettings.rules.dailyDue'), t('adSettings.rules.sameDay'), undefined, true)}
            <label className="field">
              <span className="field-label">
                <span>
                  {t('adSettings.rules.weeklyDue')} <span className="req">*</span>
                </span>
              </span>
              <select className="select" value={d.weeklyReportDueWeekday} onChange={(e) => set('weeklyReportDueWeekday')(e.target.value)}>
                {WEEKDAYS.map((w) => (
                  <option key={w} value={w}>
                    {t(`adSettings.rules.weekday.${w}`)}
                  </option>
                ))}
              </select>
            </label>
            {field('weeklyReportDueTime', t('adSettings.rules.weeklyTime'), 'WIB')}
          </>,
        )}
        {card(
          t('adSettings.rules.freshness'),
          t('adSettings.rules.freshnessSub'),
          <>
            {field('sensorDelayedAfterMinutes', t('adSettings.rules.delayedAfter'), 'min')}
            {field('sensorOfflineAfterMinutes', t('adSettings.rules.offlineAfterLabel'), 'min')}
          </>,
        )}
      </div>
      <div className="grid cols-2">
        {card(t('adSettings.rules.alerts'), null, field('attentionToAlertMinutes', t('adSettings.rules.attentionLasts'), 'min', t('adSettings.rules.attentionHelp'), true))}
        {card(
          t('adSettings.rules.production'),
          t('adSettings.rules.productionSub'),
          <>
            {field('productionAttentionPct', t('adSettings.rules.attentionFrom'), '%')}
            {field('productionWarningPct', t('adSettings.rules.warningFrom'), '%')}
          </>,
        )}
      </div>
      <div className="row-between">
        <span className="caption">{t('adSettings.updated', { date: formatDate(settings.updatedAt), name: settings.updatedBy.name })}</span>
        <div className="row">
          {save.isError && <span className="helper is-error">{isApiError(save.error) ? save.error.problem?.title : t('adUsers.failed')}</span>}
          <button type="button" className="btn btn--outline" disabled={!dirty} onClick={() => setD(initial)}>
            {t('adSettings.discard')}
          </button>
          <button type="button" className="btn btn--primary" disabled={!dirty || hasErrors || save.isPending} onClick={() => setConfirming(true)}>
            {t('adUsers.saveChanges')}
          </button>
        </div>
      </div>
      {confirming && (
        <SaveDialog title={t('adSettings.rules.confirmTitle')} busy={save.isPending} onCancel={() => setConfirming(false)} onConfirm={send}>
          {t('adSettings.rules.confirmBody')}
        </SaveDialog>
      )}
    </div>
  )
}
