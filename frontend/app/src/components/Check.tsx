import { cx } from '@/lib/cx'

/** Checkbox (08 §09 `.check`): a button with the checkbox role so it can sit inside tables and labels. */
export function Check({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  label?: string
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      className={cx('check', checked && 'is-on')}
      style={{ padding: 0, cursor: disabled ? 'default' : 'pointer' }}
      onClick={() => onChange(!checked)}
    />
  )
}
