import { Beaker, Eye, Gauge, Ruler, Thermometer, Wind, type LucideIcon } from 'lucide-react'
import type { components } from '@/api/schema'
import type { SensorParameter } from '@/api/types'
import { formatLimit } from './format'

/** Water-quality parameters (04 §6.1): order, display decimals, units, icons. */
export const SENSOR_PARAMS: SensorParameter[] = ['do', 'ph', 'temperature', 'tds', 'turbidity', 'water_level']

export const DIGITS: Record<SensorParameter, number> = { do: 1, ph: 1, temperature: 1, tds: 0, turbidity: 0, water_level: 0 }

export const UNIT: Record<SensorParameter, string> = { do: 'mg/L', ph: '', temperature: '°C', tds: 'mg/L', turbidity: 'NTU', water_level: 'cm' }

export const PARAM_ICON: Record<SensorParameter, LucideIcon> = {
  do: Wind,
  ph: Beaker,
  temperature: Thermometer,
  tds: Gauge,
  turbidity: Eye,
  water_level: Ruler,
}

export const isSensorParameter = (p: string | null): p is SensorParameter => SENSOR_PARAMS.includes(p as SensorParameter)

type Threshold = components['schemas']['Threshold']

/** "Range" shown with a value = the Warning thresholds, where a Pond Alert is raised (04 §6.2): "≥ 4.5", "26–31". */
export function warningRange(t: Threshold): string {
  const low = t.warningLow ?? null
  const high = t.warningHigh ?? null
  if (low !== null && high !== null) return `${formatLimit(low)}–${formatLimit(high)}`
  if (low !== null) return `≥ ${formatLimit(low)}`
  if (high !== null) return `≤ ${formatLimit(high)}`
  return '—'
}
