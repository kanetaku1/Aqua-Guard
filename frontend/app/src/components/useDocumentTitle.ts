import { useEffect } from 'react'

/** Sets the browser tab title: "TM-01 Dashboard · AquaGuard" (same format as the prototype). */
export function useDocumentTitle(title: string) {
  useEffect(() => {
    document.title = `${title} · AquaGuard`
  }, [title])
}
