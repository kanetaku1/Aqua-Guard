import { ChevronRight } from 'lucide-react'
import { Fragment, type ReactNode } from 'react'
import { Link } from 'react-router'
import { Icon } from './Icon'

export type Crumb = { label: string; to?: string }

export function PageHeader({
  title,
  meta,
  actions,
  breadcrumb,
}: {
  title: ReactNode
  meta?: ReactNode
  actions?: ReactNode
  breadcrumb?: Crumb[]
}) {
  return (
    <div className="page-header">
      <div>
        {breadcrumb && (
          <nav className="breadcrumb" aria-label="Breadcrumb">
            {breadcrumb.map((c, i) => (
              <Fragment key={c.label}>
                {i > 0 && <Icon icon={ChevronRight} />}
                {c.to ? <Link to={c.to}>{c.label}</Link> : <span>{c.label}</span>}
              </Fragment>
            ))}
          </nav>
        )}
        <h1 className="page-title">{title}</h1>
        {meta && <div className="page-meta">{meta}</div>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </div>
  )
}

export function Card({
  title,
  sub,
  action,
  children,
}: {
  title: ReactNode
  sub?: ReactNode
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="card">
      <div className="card-header">
        {sub ? (
          <div>
            <h2 className="card-title">{title}</h2>
            <div className="card-sub">{sub}</div>
          </div>
        ) : (
          <h2 className="card-title">{title}</h2>
        )}
        {action}
      </div>
      {children}
    </section>
  )
}
