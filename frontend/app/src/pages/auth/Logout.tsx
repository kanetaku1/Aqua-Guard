import { useEffect } from 'react'
import { Navigate } from 'react-router'
import { useLogout } from '@/api/queries/auth'

/** /logout — ends the session and returns to Login. */
export function Logout() {
  const logout = useLogout()
  const { mutate } = logout
  useEffect(() => {
    mutate()
  }, [mutate])
  return logout.isIdle || logout.isPending ? null : <Navigate to="/login" replace />
}
