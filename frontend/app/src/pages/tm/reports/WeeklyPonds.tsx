import { ArrowRight, Database, TrendingDown, TrendingUp } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router'
import type { components } from '@/api/schema'
import type { Severity } from '@/api/types'
import { Tabs } from '@/components/Controls'
import { Icon } from '@/components/Icon'
import { cx } from '@/lib/cx'
import { formatCalendarDate, formatNumber, formatSignedPct } from '@/lib/format'

type S = components['schemas']
const PW = ['growth', 'wq', 'feed', 'lab'] as const
type Pw = (typeof PW)[number]

const val = (sev: Severity | null | undefined) => (sev && sev !== 'normal' ? `val-${sev}` : undefined)
const muted = (n: number) => (n === 0 ? <span className="text-muted">0</span> : n)

function Trend({ trend, label }: { trend: S['Trend']; label: string }) {
  return (
    <span className="trend">
      <Icon icon={trend === 'increasing' ? TrendingUp : trend === 'decreasing' ? TrendingDown : ArrowRight} />
      {label}
    </span>
  )
}

function Change({ pct }: { pct: number | null }) {
  if (pct === null) return <span className="text-muted">—</span>
  return <Trend trend={pct > 0 ? 'increasing' : pct < 0 ? 'decreasing' : 'stable'} label={formatSignedPct(pct)} />
}

/**
 * "Ponds this week" (05 FM-06 §5): one table per topic, one row per Pond, no Farm averages (04 §4.1).
 * The topic lives in `?pw=` (growth / wq / feed / lab).
 */
export function WeeklyPondsCard({
  report,
  readOnly,
  comment,
  onComment,
}: {
  report: S['WeeklyReport']
  readOnly: boolean
  comment: string
  onComment: (c: string) => void
}) {
  const { t } = useTranslation()
  const [params] = useSearchParams()
  const pw: Pw = PW.includes(params.get('pw') as Pw) ? (params.get('pw') as Pw) : 'growth'
  const rows = report.pondsThisWeek
  const pending = rows.filter((r) => r.laboratory.pending).length

  return (
    <section className="card">
      <div className="card-header">
        <div>
          <h2 className="card-title">{t('weekly.ponds.title')}</h2>
          <div className="card-sub">{t('weekly.ponds.sub')}</div>
        </div>
        {!readOnly && (
          <span className="source-tag">
            <Icon icon={Database} />
            {t('weekly.fromRecords')}
          </span>
        )}
      </div>
      <Tabs
        param="pw"
        keep={['tab', 'id']}
        active={pw}
        style={{ padding: '0 24px' }}
        countStyle={{ background: 'var(--color-water-blue)' }}
        tabs={[
          { key: 'growth', label: t('weekly.ponds.growth') },
          { key: 'wq', label: t('weekly.ponds.wq') },
          { key: 'feed', label: t('weekly.ponds.feed') },
          { key: 'lab', label: t('weekly.ponds.lab'), count: pending },
        ]}
      />

      {pw === 'growth' && (
        <table className="table table-compact">
          <thead>
            <tr>
              <th>{t('daily.ponds.pond')}</th>
              <th className="num">DOC</th>
              <th className="num">ABW</th>
              <th className="num">ADG</th>
              <th>{t('tmPonds.vsTarget')}</th>
              <th className="num">SR</th>
              <th className="num">FCR</th>
              <th className="num">{t('weekly.kpi.biomass')}</th>
              <th className="num">{t('weekly.ponds.uniformity')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ pond, growth: g }) => (
              <tr key={pond.id}>
                <td className="cell-main">{pond.name}</td>
                <td className="num">{g.doc ?? '—'}</td>
                <td className="num">{g.abwG == null ? '—' : `${formatNumber(g.abwG, 1)} g`}</td>
                <td className="num">{g.adgGPerDay == null ? '—' : `${formatNumber(g.adgGPerDay, 2)} g`}</td>
                <td>
                  {g.vsTargetPct == null || !g.growth ? (
                    <span className="text-muted">—</span>
                  ) : (
                    <span className={cx('status-text', g.growth === 'behind' ? 'st--attention' : 'st--normal')}>
                      {formatSignedPct(g.vsTargetPct)} {t(`growth.${g.growth}`)}
                    </span>
                  )}
                </td>
                <td className="num">{g.survivalRatePct == null ? '—' : `${formatNumber(g.survivalRatePct)}%`}</td>
                <td className="num">{g.fcr == null ? '—' : formatNumber(g.fcr, 2)}</td>
                <td className="num">{g.biomassKg == null ? '—' : `${formatNumber(g.biomassKg / 1000, 2)} t`}</td>
                <td className="num">{g.sizeUniformityPct == null ? '—' : `${formatNumber(g.sizeUniformityPct)}%`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {pw === 'wq' && (
        <>
          <table className="table table-compact">
            <thead>
              <tr>
                <th>{t('daily.ponds.pond')}</th>
                <th className="num">{t('weekly.ponds.doMin')}</th>
                <th className="num">{t('weekly.ponds.phRange')}</th>
                <th className="num">{t('weekly.ponds.tempMax')}</th>
                <th className="num">{t('weekly.ponds.daysOut')}</th>
                <th className="num">{t('pondAlerts.title')}</th>
                <th>{t('weekly.ponds.trend')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ pond, waterQuality: w }) => (
                <tr key={pond.id}>
                  <td className="cell-main">{pond.name}</td>
                  <td className={cx('num', val(w.severity.doMin))}>{w.doMin === null ? '—' : formatNumber(w.doMin, 1)}</td>
                  <td className={cx('num', val(w.severity.ph))}>{w.phMin === null || w.phMax === null ? '—' : `${formatNumber(w.phMin, 1)}–${formatNumber(w.phMax, 1)}`}</td>
                  <td className={cx('num', val(w.severity.temperatureMax))}>{w.temperatureMax === null ? '—' : formatNumber(w.temperatureMax, 1)}</td>
                  <td className="num">{muted(w.outOfRangeDays)}</td>
                  <td className="num">{muted(w.alertCount)}</td>
                  <td>
                    <Trend trend={w.trend} label={w.trendParameter ? t(`param.${w.trendParameter}`) : t('weekly.ponds.stable')} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {readOnly ? (
            comment.trim() && (
              <div className="card-body" style={{ borderTop: '1px solid var(--color-border)' }}>
                <div className="subsection-title">{t('weekly.ro.comment')}</div>
                <p className="prose" style={{ margin: 0 }}>
                  {comment}
                </p>
              </div>
            )
          ) : (
          <div className="card-body" style={{ borderTop: '1px solid var(--color-border)' }}>
            <label className="field">
              <span className="field-label">{t('weekly.ponds.comment')}</span>
              <textarea
                className="textarea"
                style={{ minHeight: 64 }}
                disabled={readOnly}
                placeholder={t('weekly.ponds.commentPlaceholder')}
                value={comment}
                onChange={(e) => onComment(e.target.value)}
              />
            </label>
          </div>
          )}
          <div className="card-footer" style={{ justifyContent: 'flex-start' }}>
            <span className="caption">{t('weekly.ponds.wqNote')}</span>
          </div>
        </>
      )}

      {pw === 'feed' && (
        <table className="table table-compact">
          <thead>
            <tr>
              <th rowSpan={2}>{t('daily.ponds.pond')}</th>
              <th colSpan={3}>{t('daily.ponds.feeding')}</th>
              <th colSpan={4}>{t('daily.ponds.mortality')}</th>
            </tr>
            <tr>
              <th className="num">{t('weekly.ponds.week')}</th>
              <th className="num">{t('weekly.ponds.reducedDays')}</th>
              <th>{t('weekly.ponds.vsPrev')}</th>
              <th className="num">{t('weekly.ponds.week')}</th>
              <th className="num">{t('weekly.ponds.per10k')}</th>
              <th>{t('weekly.ponds.peak')}</th>
              <th>{t('weekly.ponds.vsPrev')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ pond }) => {
              const f = report.feeding.byPond.find((x) => x.pond.id === pond.id)
              const m = report.mortality.byPond.find((x) => x.pond.id === pond.id)
              return (
                <tr key={pond.id}>
                  <td className="cell-main">{pond.name}</td>
                  <td className="num">{f ? `${formatNumber(f.value)} kg` : '—'}</td>
                  <td className="num">{f?.reducedAppetiteDays == null ? '—' : muted(f.reducedAppetiteDays)}</td>
                  <td>
                    <Change pct={f?.changePct ?? null} />
                  </td>
                  <td className="num">{m ? `${formatNumber(m.value)} pcs` : '—'}</td>
                  <td className="num">{m?.per10kStocked == null ? '—' : formatNumber(m.per10kStocked, 1)}</td>
                  <td className="text-muted">{m?.peakDate ? `${formatCalendarDate(m.peakDate)} (${m.peakValue})` : '—'}</td>
                  <td>
                    <Change pct={m?.changePct ?? null} />
                  </td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr>
              <td>{t('weekly.ponds.farmTotal', { farm: report.farm.name })}</td>
              <td className="num">{formatNumber(report.feeding.total)} kg</td>
              <td className="num">{t('weekly.ponds.pondsCount', { count: report.feeding.reducedAppetitePonds ?? 0 })}</td>
              <td />
              <td className="num">{formatNumber(report.mortality.total)} pcs</td>
              <td className="num">{report.mortality.per10kStocked == null ? '—' : formatNumber(report.mortality.per10kStocked, 1)}</td>
              <td />
              <td />
            </tr>
          </tfoot>
        </table>
      )}

      {pw === 'lab' && (
        <>
          <table className="table table-compact">
            <thead>
              <tr>
                <th>{t('daily.ponds.pond')}</th>
                <th className="num">TAN mg/L</th>
                <th className="num">NO2 mg/L</th>
                <th className="num">Vibrio ×10³ CFU/mL</th>
                <th className="num">Alkalinity mg/L</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ pond, laboratory: l }) => (
                <tr key={pond.id}>
                  <td className="cell-main">{pond.name}</td>
                  {l.pending ? (
                    <td colSpan={4}>
                      <span className="status-text st--progress">{t('sampling.pending')}</span>{' '}
                      {l.expectedOn && <span className="caption">{t('weekly.ponds.expected', { date: formatCalendarDate(l.expectedOn) })}</span>}
                    </td>
                  ) : (
                    <>
                      <td className={cx('num', val(l.severity.tan))}>{l.tan == null ? '—' : formatNumber(l.tan, 1)}</td>
                      <td className={cx('num', val(l.severity.no2))}>{l.no2 == null ? '—' : formatNumber(l.no2, 2)}</td>
                      <td className={cx('num', val(l.severity.vibrio))}>{l.vibrio == null ? '—' : formatNumber(l.vibrio, 1)}</td>
                      <td className={cx('num', val(l.severity.alkalinity))}>{l.alkalinity == null ? '—' : formatNumber(l.alkalinity)}</td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          <div className="card-footer" style={{ justifyContent: 'flex-start' }}>
            <span className="caption">{t('weekly.ponds.labReference')}</span>
          </div>
        </>
      )}
    </section>
  )
}
