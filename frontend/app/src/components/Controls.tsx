import { ChevronLeft, ChevronRight, type LucideIcon } from 'lucide-react'
import { useEffect, useId, type CSSProperties, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useLocation } from 'react-router'
import { cx } from '@/lib/cx'
import { Icon } from './Icon'

/**
 * Tabs (08 §09): each tab is a link to `?{param}={key}` so the tab lives in the URL.
 * `keep` lists other query params to carry over (e.g. the report `id` for inner tabs).
 */
export function Tabs<K extends string>({
  tabs,
  active,
  param = 'tab',
  keep = [],
  style,
  countStyle,
}: {
  tabs: { key: K; label: string; icon?: LucideIcon; count?: number }[]
  active: K
  param?: string
  keep?: string[]
  style?: CSSProperties
  countStyle?: CSSProperties
}) {
  const { search } = useLocation()
  const href = (key: K) => {
    const current = new URLSearchParams(search)
    const next = new URLSearchParams()
    keep.forEach((k) => current.has(k) && next.set(k, current.get(k)!))
    next.set(param, key)
    return `?${next}`
  }
  return (
    <nav className="tabs" aria-label="Tabs" style={style}>
      {tabs.map((t) => (
        <Link
          key={t.key}
          className={cx('tab', t.key === active && 'is-active')}
          to={href(t.key)}
          aria-current={t.key === active ? 'page' : undefined}
        >
          {t.icon && <Icon icon={t.icon} />}
          {t.label}
          {!!t.count && (
            <span className="count" style={countStyle}>
              {t.count}
            </span>
          )}
        </Link>
      ))}
    </nav>
  )
}

/** Segmented control (08 §09). */
export function Segmented<K extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: { key: K; label: string }[]
  value: K
  onChange: (key: K) => void
  label: string
}) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.key} type="button" className={cx(o.key === value && 'is-active')} aria-pressed={o.key === value} onClick={() => onChange(o.key)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

/** Pagination (08 §09): previous · up to 5 page numbers · next. */
export function Pagination({ page, pageCount, onChange }: { page: number; pageCount: number; onChange: (page: number) => void }) {
  const { t } = useTranslation()
  if (pageCount <= 1) return null
  const start = Math.max(1, Math.min(page - 2, pageCount - 4))
  const pages = Array.from({ length: Math.min(5, pageCount) }, (_, i) => start + i)
  const step = (to: number, label: string, icon: LucideIcon, disabled: boolean) =>
    disabled ? (
      <span className="is-disabled" aria-disabled="true" aria-label={label}>
        <Icon icon={icon} />
      </span>
    ) : (
      <a
        href="#"
        aria-label={label}
        onClick={(e) => {
          e.preventDefault()
          onChange(to)
        }}
      >
        <Icon icon={icon} />
      </a>
    )
  return (
    <nav className="pagination" aria-label={t('common.pagination')}>
      {step(page - 1, t('common.previousPage'), ChevronLeft, page <= 1)}
      {pages.map((p) =>
        p === page ? (
          <span key={p} className="is-active" aria-current="page">
            {p}
          </span>
        ) : (
          <a
            key={p}
            href="#"
            onClick={(e) => {
              e.preventDefault()
              onChange(p)
            }}
          >
            {p}
          </a>
        ),
      )}
      {step(page + 1, t('common.nextPage'), ChevronRight, page >= pageCount)}
    </nav>
  )
}

/** Confirmation dialog (08 Dialog). Esc / Cancel / click outside close it. */
export function ConfirmDialog({
  title,
  children,
  confirmLabel,
  onConfirm,
  onCancel,
  busy,
}: {
  title: string
  children: ReactNode
  confirmLabel: string
  onConfirm: () => void
  onCancel: () => void
  busy?: boolean
}) {
  const { t } = useTranslation()
  const titleId = useId()
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCancel()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onCancel])
  return (
    <div className="overlay is-open" onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="dialog-body">
          <h2 className="dialog-title" id={titleId}>
            {title}
          </h2>
          {children}
        </div>
        <div className="dialog-footer">
          <button type="button" className="btn btn--outline" onClick={onCancel}>
            {t('common.cancel')}
          </button>
          <button type="button" className="btn btn--primary" onClick={onConfirm} disabled={busy}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
