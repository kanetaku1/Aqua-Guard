import { addDays, addMonths, isAfter, isSameDay, isSameMonth, parseISO, startOfMonth } from 'date-fns'
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { format, todayInWib } from '@/lib/format'
import { cx } from '@/lib/cx'
import { Icon } from './Icon'


/**
 * Date Field with calendar popover (08 §09, 07: dates are always picked from a calendar).
 * Value is a WIB calendar date "2026-10-05"; shown as "5 Oct 2026". Monday first, today outlined,
 * future dates disabled unless `allowFuture` (planned dates such as the next sampling).
 */
export function DateField({
  value,
  onChange,
  allowFuture,
  id,
  invalid,
}: {
  value: string
  onChange: (date: string) => void
  allowFuture?: boolean
  id?: string
  invalid?: boolean
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const selected = value ? parseISO(value) : null
  const today = parseISO(todayInWib())
  const [view, setView] = useState(() => startOfMonth(selected ?? today))
  const ref = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false)
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const toggle = () => {
    if (!open) setView(startOfMonth(selected ?? today))
    setOpen((o) => !o)
  }
  const pick = (d: Date) => {
    onChange(format(d, 'yyyy-MM-dd'))
    setOpen(false)
  }

  const first = startOfMonth(view)
  const start = addDays(first, -((first.getDay() + 6) % 7))
  const days = Array.from({ length: 42 }, (_, i) => addDays(start, i))

  return (
    <span className="date-field" ref={ref}>
      <input
        id={id}
        className={cx('input', invalid && 'is-error')}
        value={selected ? format(selected, 'd MMM yyyy') : ''}
        readOnly
        onClick={toggle}
        aria-haspopup="dialog"
        aria-expanded={open}
      />
      <button type="button" className="icon-btn date-btn" aria-label={t('date.open')} onClick={toggle}>
        <Icon icon={Calendar} />
      </button>
      {open && (
        <div className="datepicker" role="dialog" aria-label={t('date.calendar')}>
          <div className="datepicker-head">
            <button type="button" className="icon-btn" aria-label={t('date.previousMonth')} onClick={() => setView(addMonths(view, -1))}>
              <Icon icon={ChevronLeft} />
            </button>
            <b>{format(view, 'MMMM yyyy')}</b>
            <button type="button" className="icon-btn" aria-label={t('date.nextMonth')} onClick={() => setView(addMonths(view, 1))}>
              <Icon icon={ChevronRight} />
            </button>
          </div>
          <div className="datepicker-grid">
            {t('date.weekdays').split(',').map((d) => (
              <span key={d} className="dp-dow">
                {d}
              </span>
            ))}
            {days.map((d) => (
              <button
                key={d.toISOString()}
                type="button"
                className={cx(
                  'dp-day',
                  !isSameMonth(d, view) && 'is-out',
                  isSameDay(d, today) && 'is-today',
                  selected && isSameDay(d, selected) && 'is-selected',
                )}
                disabled={!allowFuture && isAfter(d, today)}
                aria-label={format(d, 'd MMM yyyy')}
                onClick={() => pick(d)}
              >
                {d.getDate()}
              </button>
            ))}
          </div>
          <div className="datepicker-foot">
            <button type="button" className="btn btn--link" onClick={() => pick(today)}>
              {t('date.today')}
            </button>
          </div>
        </div>
      )}
    </span>
  )
}
