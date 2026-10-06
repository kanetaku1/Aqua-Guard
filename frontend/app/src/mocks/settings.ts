import type { components } from '@/api/schema'
import { growthCurve } from './data'

type S = components['schemas']
type Threshold = S['Threshold']
type Boundaries = Pick<Threshold, 'criticalLow' | 'warningLow' | 'attentionLow' | 'attentionHigh' | 'warningHigh' | 'criticalHigh'>

/**
 * AD-04 settings (values from the sa-settings wireframe and 04 §5–§8). Farm D overrides DO.
 * "now" = 29 Sep 2026 09:35 WIB.
 */
const YUSUF = { id: 'u-yusuf', name: 'Yusuf Rahman' }
const UPDATED = '2026-09-02T03:00:00Z'
export const BOUNDARIES = ['criticalLow', 'warningLow', 'attentionLow', 'attentionHigh', 'warningHigh', 'criticalHigh'] as const

const row = (parameter: Threshold['parameter'], unit: string, sides: NonNullable<Threshold['sides']>, v: (number | null)[]): Threshold => ({
  parameter,
  unit,
  sides,
  criticalLow: v[0],
  warningLow: v[1],
  attentionLow: v[2],
  attentionHigh: v[3],
  warningHigh: v[4],
  criticalHigh: v[5],
})

function seedDefaults(): Threshold[] {
  return [
    row('do', 'mg/L', 'low', [3.5, 4.5, 5.0, null, null, null]),
    row('ph', '', 'both', [7.0, 7.3, 7.5, 8.5, 8.7, 9.0]),
    row('temperature', '°C', 'both', [24, 26, 26.5, 30.5, 31, 33]),
    row('tds', 'mg/L', 'both', [null, 15000, 16000, 24000, 25000, null]),
    row('turbidity', 'NTU', 'both', [null, 20, 25, 60, 80, null]),
    row('water_level', 'cm', 'both', [105, 115, 120, 150, 155, null]),
    row('tan', 'mg/L', 'high', [null, null, null, 1.0, 2.0, null]),
    row('no2', 'mg/L', 'high', [null, null, null, 0.5, 1.0, null]),
    row('vibrio', '×10³ CFU/mL', 'high', [null, null, null, 5, 10, null]),
    row('alkalinity', 'mg/L', 'both', [null, 80, 100, 150, 180, null]),
  ]
}

function seed() {
  return {
    defaults: seedDefaults(),
    defaultsMeta: { updatedAt: UPDATED, updatedBy: YUSUF },
    /** farmId → overridden rows (by parameter) */
    overrides: new Map<string, { rows: Threshold[]; updatedAt: string; updatedBy: { id: string; name: string } }>([
      ['farm-d', { rows: [row('do', 'mg/L', 'low', [3.5, 4.0, 4.5, null, null, null])], updatedAt: '2026-08-20T03:00:00Z', updatedBy: YUSUF }],
    ]),
    growth: { points: growthCurve.map((p) => ({ ...p })), onTrackBandPct: 5, updatedAt: UPDATED, updatedBy: YUSUF },
    rules: {
      dailyReportDue: '18:00',
      weeklyReportDueWeekday: 1,
      weeklyReportDueTime: '12:00',
      sensorDelayedAfterMinutes: 15,
      sensorOfflineAfterMinutes: 60,
      attentionToAlertMinutes: 30,
      productionAttentionPct: 25,
      productionWarningPct: 50,
      updatedAt: UPDATED,
      updatedBy: YUSUF,
    } as S['RuleSettings'],
  }
}

export let settings = seed()
export function resetSettings() {
  settings = seed()
}

/** Thresholds for the default or a Farm: a Farm's rows are its overrides, the rest inherited from the default. */
export function thresholdsFor(farmId: string | null, farms: { id: string; name: string }[]): S['ThresholdSettings'] {
  const override = farmId ? settings.overrides.get(farmId) : undefined
  const items = settings.defaults.map((d) => {
    const own = override?.rows.find((r) => r.parameter === d.parameter)
    return own ? { ...own, inherited: false } : { ...d, inherited: !!farmId }
  })
  const meta = override ?? settings.defaultsMeta
  return {
    farmId,
    items,
    updatedAt: meta.updatedAt,
    updatedBy: meta.updatedBy,
    farms: farms.map((f) => ({ farm: f, parameters: settings.overrides.get(f.id)?.rows.map((r) => r.parameter) ?? [] })),
  }
}

/** Order checks (04 §6.2): values move away from Normal — Attention → Warning → Critical on each side. */
export function thresholdErrors(items: Boundaries[] & { parameter: string }[]) {
  const errors: { field: string; message: string }[] = []
  for (const t of items) {
    const low = [t.criticalLow, t.warningLow, t.attentionLow]
    const high = [t.attentionHigh, t.warningHigh, t.criticalHigh]
    const check = (values: (number | null | undefined)[], names: string[]) => {
      const present = values.map((v, i) => [v, names[i]] as const).filter(([v]) => v !== null && v !== undefined)
      for (let i = 1; i < present.length; i++) {
        if (!(present[i][0]! > present[i - 1][0]!)) errors.push({ field: `${t.parameter}/${present[i][1]}`, message: 'Boundaries are out of order' })
      }
    }
    check(low, ['criticalLow', 'warningLow', 'attentionLow'])
    check(high, ['attentionHigh', 'warningHigh', 'criticalHigh'])
    const innerLow = [...low].reverse().find((v) => v !== null && v !== undefined)
    const innerHigh = high.find((v) => v !== null && v !== undefined)
    if (innerLow != null && innerHigh != null && !(innerHigh > innerLow)) errors.push({ field: `${t.parameter}/attentionHigh`, message: 'The high side must be above the low side' })
  }
  return errors
}
