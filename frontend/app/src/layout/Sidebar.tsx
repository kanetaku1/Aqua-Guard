import { Fragment } from 'react'
import { Link, useLocation } from 'react-router'
import { useTranslation } from 'react-i18next'
import type { Role } from '@/api/types'
import { cx } from '@/lib/cx'
import { NAV, activeSubIndex } from './nav'

/** Role sidebar; the active item shows its sub navigation (same on every screen of the Role). */
export function Sidebar({ role }: { role: Role }) {
  const { t } = useTranslation()
  const { pathname, search } = useLocation()

  return (
    <aside className="sb">
      <div className="sb-label">{t(`role.${role}`)}</div>
      {NAV[role].map((item) => {
        const active = pathname === item.match || pathname.startsWith(`${item.match}/`)
        const subIndex = item.sub ? activeSubIndex(item.sub, pathname, search) : -1
        return (
          <Fragment key={item.key}>
            <Link className={cx('sb-item', active && 'is-active')} to={item.to} aria-current={active ? 'page' : undefined}>
              <item.icon strokeWidth={1.75} aria-hidden="true" />
              {t(item.labelKey)}
            </Link>
            {item.sub && active && (
              <div className="sb-sub">
                {item.sub.map((s, i) => (
                  <Link key={s.to} className={cx(i === subIndex && 'is-active')} to={s.to}>
                    {t(s.labelKey)}
                  </Link>
                ))}
              </div>
            )}
          </Fragment>
        )
      })}
    </aside>
  )
}
