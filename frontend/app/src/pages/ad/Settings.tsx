import { ClipboardList, SlidersVertical, TrendingUp } from 'lucide-react'
import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router'
import { Tabs } from '@/components/Controls'
import { PageHeader } from '@/components/Page'
import { Toast } from '@/components/Toast'
import { useDocumentTitle } from '@/components/useDocumentTitle'
import { GrowthTab } from './settings/GrowthTab'
import { RulesTab } from './settings/RulesTab'
import { ThresholdsTab } from './settings/ThresholdsTab'

type TabKey = 'thresholds' | 'growth' | 'rules'
const TABS: TabKey[] = ['thresholds', 'growth', 'rules']

/**
 * AD-04 Settings (05 §5B AD-04, 06 AD-04, wireframe sa-settings.png): the rules used to judge water quality, growth
 * and reports (values in 04). Tabs in `?tab=`. Every save is confirmed and applies from then on — past Alerts and
 * Reports are not changed.
 */
export function AdSettings() {
  useDocumentTitle('AD-04 Settings')
  const { t } = useTranslation()
  const [params] = useSearchParams()
  const tab: TabKey = TABS.includes(params.get('tab') as TabKey) ? (params.get('tab') as TabKey) : 'thresholds'
  const [toast, setToast] = useState<string | null>(null)
  const clearToast = useCallback(() => setToast(null), [])

  return (
    <>
      <PageHeader title={t('adSettings.title')} meta={<span>{t('adSettings.meta')}</span>} />
      <Tabs
        active={tab}
        tabs={[
          { key: 'thresholds', label: t('nav.thresholds'), icon: SlidersVertical },
          { key: 'growth', label: t('nav.growthTargets'), icon: TrendingUp },
          { key: 'rules', label: t('nav.rules'), icon: ClipboardList },
        ]}
      />
      {tab === 'thresholds' ? <ThresholdsTab onDone={setToast} /> : tab === 'growth' ? <GrowthTab onDone={setToast} /> : <RulesTab onDone={setToast} />}
      {toast && <Toast message={toast} onDone={clearToast} />}
    </>
  )
}
