import type { UseQueryResult } from '@tanstack/react-query'
import { CircleAlert } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

/**
 * Loading / Error states for one section (07 "Empty / Loading / Error").
 * Renders `children(data)` once the query has data; keeps showing stale data while refetching.
 */
export function QueryState<T>({ query, children }: { query: UseQueryResult<T>; children: (data: T) => ReactNode }) {
  const { t } = useTranslation()
  if (query.data !== undefined) return <>{children(query.data)}</>
  if (query.isError) {
    return (
      <div className="empty" role="alert">
        <CircleAlert strokeWidth={1.75} aria-hidden="true" />
        <span className="empty-title">{t('common.loadError')}</span>
        <button type="button" className="btn btn--outline btn--sm" onClick={() => void query.refetch()}>
          {t('common.retry')}
        </button>
      </div>
    )
  }
  return (
    <div className="card-body stack" aria-busy="true" aria-label={t('common.loading')}>
      <span className="skeleton" />
      <span className="skeleton" />
      <span className="skeleton" />
    </div>
  )
}
