import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { ConfirmDialog } from '@/components/Controls'
import { now } from '@/lib/clock'
import { formatDate } from '@/lib/format'

/** Save confirmation for settings (05 AD-04): where the change applies, from when, and that the past is not changed. */
export function SaveDialog({ title, children, busy, onCancel, onConfirm }: { title: string; children: ReactNode; busy: boolean; onCancel: () => void; onConfirm: () => void }) {
  const { t } = useTranslation()
  return (
    <ConfirmDialog title={title} confirmLabel={t('adUsers.saveChanges')} busy={busy} onCancel={onCancel} onConfirm={onConfirm}>
      <p className="text-muted">{children}</p>
      <dl className="dl dl-2" style={{ background: 'var(--color-mist)', padding: 16, borderRadius: 8 }}>
        <div>
          <dt>{t('adSettings.appliesFrom')}</dt>
          <dd>{t('adSettings.now', { date: formatDate(now().toISOString()) })}</dd>
        </div>
        <div>
          <dt>{t('adSettings.past')}</dt>
          <dd>{t('adSettings.notChanged')}</dd>
        </div>
      </dl>
    </ConfirmDialog>
  )
}
