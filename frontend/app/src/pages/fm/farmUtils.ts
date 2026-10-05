import type { FarmSummary, Issue } from '@/api/types'
import { isSensorParameter } from '@/lib/params'

const RANK = ['critical', 'warning', 'attention', 'normal']

/** Most severe first, then by name. */
export const sortFarms = (farms: FarmSummary[]) =>
  [...farms].sort((a, b) => RANK.indexOf(a.status) - RANK.indexOf(b.status) || a.name.localeCompare(b.name))

/** "Water Quality · DO decreasing" */
export function issueTitle(issue: Issue, t: (key: string, o?: Record<string, unknown>) => string): string {
  const param = isSensorParameter(issue.parameter) ? t(`paramName.${issue.parameter}`) : t(`issueParam.${issue.parameter}`, { defaultValue: issue.parameter })
  return t('fm.issueTitle', { type: t(`issueType.${issue.issueType}`), param, trend: t(`trendLabel.${issue.trend}`) })
}
