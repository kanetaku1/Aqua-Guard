import { CircleCheck } from 'lucide-react'
import { useEffect } from 'react'

/** Confirmation after saving (08 Toast): message, optional detail line. Hides itself after 5 seconds. */
export function Toast({ message, detail, onDone }: { message: string; detail?: string; onDone: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onDone, 5000)
    return () => clearTimeout(timer)
  }, [message, detail, onDone])
  return (
    <div className="toast toast-fixed" role="status">
      <CircleCheck strokeWidth={1.75} aria-hidden="true" />
      {detail ? (
        <div>
          <b>{message}</b>
          <div style={{ opacity: 0.8 }}>{detail}</div>
        </div>
      ) : (
        <span>{message}</span>
      )}
    </div>
  )
}
