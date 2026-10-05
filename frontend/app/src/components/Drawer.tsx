import { X } from 'lucide-react'
import { useEffect, useId, useRef, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { cx } from '@/lib/cx'
import { Icon } from './Icon'

/** Side drawer on an overlay (08 Drawer; `wide` = 960). Closes on Esc, the × button or a click outside. */
export function Drawer({
  title,
  caption,
  wide,
  onClose,
  footer,
  children,
}: {
  title: ReactNode
  caption?: ReactNode
  wide?: boolean
  onClose: () => void
  footer?: ReactNode
  children: ReactNode
}) {
  const { t } = useTranslation()
  const titleId = useId()
  const panel = useRef<HTMLElement>(null)

  useEffect(() => {
    panel.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="overlay is-open" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside
        ref={panel}
        className={cx('drawer', wide && 'drawer--wide')}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <div className="drawer-header">
          <div>
            {caption && <div className="caption">{caption}</div>}
            <h2 className="dialog-title" id={titleId}>
              {title}
            </h2>
          </div>
          <button type="button" className="icon-btn" aria-label={t('common.close')} onClick={onClose}>
            <Icon icon={X} />
          </button>
        </div>
        <div className="drawer-body">{children}</div>
        {footer && <div className="drawer-footer">{footer}</div>}
      </aside>
    </div>
  )
}
