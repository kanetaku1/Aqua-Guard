import type { LucideIcon } from 'lucide-react'
import { cx } from '@/lib/cx'

/** Lucide icon sized by the design system's `.icon` class (inline 16px, stroke 1.75). */
export function Icon({ icon: Glyph, className }: { icon: LucideIcon; className?: string }) {
  return <Glyph className={cx('icon', className)} strokeWidth={1.75} aria-hidden="true" />
}
