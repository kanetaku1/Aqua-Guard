import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { Icon } from './Icon'

/**
 * KPI card (08 KPI Card): name + value type (Actual / Estimated / Forecast, CLAUDE.md rule), value with unit,
 * comparison line and the basis of the number.
 */
export function Kpi({
  name,
  type,
  value,
  unit,
  compare,
  compareIcon,
  basis,
}: {
  name: string
  type: string
  value: ReactNode
  unit?: string
  compare?: ReactNode
  compareIcon?: LucideIcon
  basis?: ReactNode
}) {
  return (
    <div className="kpi">
      <div className="kpi-head">
        <span className="kpi-name">{name}</span>
        <span className="kpi-type">{type}</span>
      </div>
      <div className="kpi-value">
        {value}
        {unit && <span className="kpi-unit">{unit}</span>}
      </div>
      {compare && (
        <div className="kpi-compare">
          {compareIcon && <Icon icon={compareIcon} />}
          {compare}
        </div>
      )}
      {basis && <div className="kpi-updated">{basis}</div>}
    </div>
  )
}
