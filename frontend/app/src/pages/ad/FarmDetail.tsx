import { Clock, MapPin, Radio, User, Warehouse, Waves } from 'lucide-react'
import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useParams, useSearchParams } from 'react-router'
import { isApiError } from '@/api/client'
import { useAdminDevices, useAdminFarm } from '@/api/queries/admin'
import { Tabs } from '@/components/Controls'
import { Icon } from '@/components/Icon'
import { PageHeader } from '@/components/Page'
import { QueryState } from '@/components/QueryState'
import { Toast } from '@/components/Toast'
import { useDocumentTitle } from '@/components/useDocumentTitle'
import { cx } from '@/lib/cx'
import { formatDate } from '@/lib/format'
import { DevicesTab } from './DevicesTab'
import { FarmInfoTab } from './FarmInfoTab'
import { PondsTab } from './PondsTab'

type TabKey = 'info' | 'ponds' | 'devices'
const TABS: TabKey[] = ['info', 'ponds', 'devices']

/**
 * AD-03 Farm Detail (05 §5B AD-03, 06 AD-03, wireframe sa-farms-ponds-detail.png): the Farm, Pond and device master.
 * Tabs in `?tab=`. No sensor values, stocking or feeding — those are the Technical Manager's (05 AD-03).
 */
export function AdFarmDetail() {
  const { t } = useTranslation()
  const { farmId = '' } = useParams()
  const [params] = useSearchParams()
  const tab: TabKey = TABS.includes(params.get('tab') as TabKey) ? (params.get('tab') as TabKey) : 'info'
  const farm = useAdminFarm(farmId)
  // Offline count for the Devices tab badge (Farm-wide, whatever the filters)
  const devices = useAdminDevices(farmId, { page: 1, pageSize: 1 })
  const [toast, setToast] = useState<string | null>(null)
  const clearToast = useCallback(() => setToast(null), [])
  useDocumentTitle(farm.data ? `AD-03 ${farm.data.name}` : 'AD-03 Farm Detail')

  if (isApiError(farm.error, 404)) {
    return (
      <section className="card">
        <div className="empty">
          <span className="empty-title">{t('adFarm.notFound')}</span>
          <Link className="btn btn--link" to="/ad/farms">
            {t('adFarm.back')}
          </Link>
        </div>
      </section>
    )
  }
  const f = farm.data
  const activeTms = f?.technicalManagers.filter((m) => m.status === 'active') ?? []

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: t('adFarms.title'), to: '/ad/farms' }, { label: f?.name ?? '…' }]}
        title={
          f && (
            <>
              {f.name}{' '}
              <span className={cx('status-text', f.status === 'active' ? 'st--normal' : 'st--neutral st--muted')} style={{ fontSize: 14, fontWeight: 400 }}>
                {t(`adFarms.status.${f.status}`)}
              </span>
            </>
          )
        }
        meta={
          f && (
            <>
              <span>
                <Icon icon={MapPin} />
                {f.location}
              </span>
              <span>
                <Icon icon={User} />
                {activeTms.length ? t('adFarm.tm', { names: activeTms.map((m) => m.name).join(', ') }) : t('adFarm.noTm')}
              </span>
              <span>
                <Icon icon={Clock} />
                {f.updatedBy ? t('adFarm.updatedBy', { date: formatDate(f.updatedAt), name: f.updatedBy.name }) : t('adFarm.updated', { date: formatDate(f.updatedAt) })}
              </span>
            </>
          )
        }
      />
      <Tabs
        active={tab}
        tabs={[
          { key: 'info', label: t('adFarm.tabs.info'), icon: Warehouse },
          { key: 'ponds', label: t('adFarm.tabs.ponds'), icon: Waves },
          { key: 'devices', label: t('adFarm.tabs.devices'), icon: Radio, count: devices.data?.counts.offline },
        ]}
      />
      <QueryState query={farm}>
        {(data) =>
          tab === 'info' ? (
            <FarmInfoTab key={data.updatedAt} farm={data} onDone={setToast} />
          ) : tab === 'ponds' ? (
            <PondsTab farm={data} onDone={setToast} />
          ) : (
            <DevicesTab farm={data} onDone={setToast} />
          )
        }
      </QueryState>
      {toast && <Toast message={toast} onDone={clearToast} />}
    </>
  )
}
