import { Eye, EyeOff } from 'lucide-react'
import { useState, type InputHTMLAttributes } from 'react'
import { useTranslation } from 'react-i18next'
import { cx } from '@/lib/cx'
import { Icon } from './Icon'

/** Password field with show / hide toggle (AU-002). */
export function PasswordInput({ invalid, className, ...props }: InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }) {
  const { t } = useTranslation()
  const [visible, setVisible] = useState(false)
  return (
    <span className="input-reveal">
      <input {...props} className={cx('input', invalid && 'is-error', className)} type={visible ? 'text' : 'password'} aria-invalid={invalid || undefined} />
      <button className="icon-btn" type="button" aria-label={t(visible ? 'auth.hidePassword' : 'auth.showPassword')} onClick={() => setVisible((v) => !v)}>
        <Icon icon={visible ? EyeOff : Eye} />
      </button>
    </span>
  )
}
