import { cx } from '@/lib/cx'

/** Toggle switch (08 §09 `.toggle`): a button with the switch role. */
export function Toggle({ on, onChange, label, disabled }: { on: boolean; onChange: (on: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      className={cx('toggle', on && 'is-on')}
      style={{ border: 0, padding: 0, cursor: disabled ? 'default' : 'pointer' }}
      onClick={() => onChange(!on)}
    />
  )
}
