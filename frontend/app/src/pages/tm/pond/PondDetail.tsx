import { Activity, Calendar, ClipboardList, Clock, Fan, Ruler, Scale, TriangleAlert, Utensils, Warehouse } from 'lucide-react'
import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useParams, useSearchParams } from 'react-router'
import { isApiError } from '@/api/client'
import { usePond } from '@/api/queries/pond'
import { Tabs } from '@/components/Controls'
import { Icon } from '@/components/Icon'
import { PageHeader } from '@/components/Page'
import { QueryState } from '@/components/QueryState'
import { StatusMark } from '@/components/StatusMark'
import { Toast } from '@/components/Toast'
import { useDocumentTitle } from '@/components/useDocumentTitle'
import { formatCalendarDate, formatNumber, formatRecentTime } from '@/lib/format'
import { ActuatorTab } from './ActuatorTab'
import { AlertDrawer } from './AlertDrawer'
import { AlertsTab } from './AlertsTab'
import { FeedingTab } from './FeedingTab'
import { IotTab } from './IotTab'
import { MortalityTab } from './MortalityTab'
import { SamplingTab } from './SamplingTab'

const TABS = ['iot', 'alerts', 'feeding', 'mortality', 'sampling', 'actuator'] as const
type TabKey = (typeof TABS)[number]

export type Notify = (message: string, detail?: string) => void

/**
 * TM-03 Pond Detail (05 §5 / 06 TM-03 / prototype screens/tm-pond-detail.html):
 * investigate one Pond and do the technical work. Tabs in `?tab=`; `?alert=<id>` opens the alert drawer.
 */
export function TmPondDetail() {
  useDocumentTitle('TM-03 Pond Detail')
  const { t } = useTranslation()
  const { pondId = '' } = useParams()
  const pond = usePond(pondId)
  const [params, setParams] = useSearchParams()
  const tab: TabKey = TABS.includes(params.get('tab') as TabKey) ? (params.get('tab') as TabKey) : 'iot'
  const alertId = params.get('alert')
  const [toast, setToast] = useState<{ message: string; detail?: string } | null>(null)
  const notify: Notify = useCallback((message, detail) => setToast({ message, detail }), [])
  const clearToast = useCallback(() => setToast(null), [])
  const closeAlert = useCallback(
    () =>
      setParams(
        (p) => {
          p.delete('alert')
          return p
        },
        { replace: true },
      ),
    [setParams],
  )

  if (isApiError(pond.error, 404)) {
    return (
      <section className="card">
        <div className="empty">
          <span className="empty-title">{t('pond.notFound')}</span>
          <Link className="btn btn--link" to="/tm/ponds">
            {t('pond.backToPonds')}
          </Link>
        </div>
      </section>
    )
  }

  return (
    <QueryState query={pond}>
      {(p) => (
        <>
          <PageHeader
            breadcrumb={[
              { label: t('nav.dashboard'), to: '/tm/dashboard' },
              { label: t('nav.ponds'), to: '/tm/ponds' },
              { label: p.pond.name },
            ]}
            title={
              <>
                {p.pond.name} <StatusMark severity={p.status} size="lg" />
              </>
            }
            meta={
              <>
                <span>
                  <Icon icon={Warehouse} />
                  {p.farm.name}
                </span>
                <span>
                  <Icon icon={Ruler} />
                  {p.areaHa} ha
                </span>
                <span>
                  <Icon icon={Calendar} />
                  {p.stockedOn
                    ? t('pond.stocked', { date: formatCalendarDate(p.stockedOn, 'd MMM yyyy'), doc: p.doc })
                    : t('pond.notStocked')}
                </span>
                {p.stockedPl !== null && (
                  <span>
                    {t('pond.stockedPl', { pl: formatNumber(p.stockedPl) })}
                    {p.abwG !== null && ` · ABW ${formatNumber(p.abwG, 1)} g`}
                  </span>
                )}
                <span>
                  <Icon icon={Clock} />
                  {t('pond.lastUpdated', { time: formatRecentTime(p.updatedAt) })}
                </span>
              </>
            }
          />

          <Tabs
            active={tab}
            tabs={[
              { key: 'iot', label: t('pond.tabs.iot'), icon: Activity },
              { key: 'alerts', label: t('pond.tabs.alerts'), icon: TriangleAlert, count: p.openAlerts },
              { key: 'feeding', label: t('pond.tabs.feeding'), icon: Utensils },
              { key: 'mortality', label: t('pond.tabs.mortality'), icon: ClipboardList },
              { key: 'sampling', label: t('pond.tabs.sampling'), icon: Scale },
              { key: 'actuator', label: t('pond.tabs.actuator'), icon: Fan },
            ]}
          />

          {tab === 'iot' && <IotTab pondId={pondId} />}
          {tab === 'alerts' && <AlertsTab pond={p} />}
          {tab === 'feeding' && <FeedingTab pond={p} notify={notify} />}
          {tab === 'mortality' && <MortalityTab pond={p} notify={notify} />}
          {tab === 'sampling' && <SamplingTab pond={p} notify={notify} />}
          {tab === 'actuator' && <ActuatorTab pond={p} notify={notify} />}

          {alertId && <AlertDrawer pondId={pondId} alertId={alertId} onClose={closeAlert} />}
          {toast && <Toast message={toast.message} detail={toast.detail} onDone={clearToast} />}
        </>
      )}
    </QueryState>
  )
}
