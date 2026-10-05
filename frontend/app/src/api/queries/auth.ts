import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, isApiError, unwrap } from '../client'
import type { Language, Me } from '../types'

export const meKey = ['me'] as const

/** Signed-in user, or `null` when there is no session. */
export function useMe() {
  return useQuery({
    queryKey: meKey,
    queryFn: async (): Promise<Me | null> => {
      try {
        return unwrap(await api.GET('/auth/me'))
      } catch (error) {
        if (isApiError(error, 401)) return null
        throw error
      }
    },
    staleTime: Infinity,
    retry: false,
  })
}

export function useLogin() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: { email: string; password: string }) => unwrap(await api.POST('/auth/login', { body })),
    onSuccess: (me) => queryClient.setQueryData(meKey, me),
  })
}

export function useLogout() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => unwrap(await api.POST('/auth/logout')),
    onSettled: () => {
      queryClient.clear()
      queryClient.setQueryData(meKey, null)
    },
  })
}

export function useUpdateLanguage() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (language: Language) => unwrap(await api.PATCH('/auth/me', { body: { language } })),
    onSuccess: (me) => queryClient.setQueryData(meKey, me),
  })
}

export function useRequestPasswordReset() {
  return useMutation({
    mutationFn: async (email: string) => unwrap(await api.POST('/auth/password/forgot', { body: { email } })),
  })
}

export function usePasswordToken(token: string | null) {
  return useQuery({
    queryKey: ['password-token', token],
    queryFn: async () =>
      unwrap(await api.GET('/auth/password/tokens/{token}', { params: { path: { token: token ?? '' } } })),
    enabled: !!token,
    retry: false,
  })
}

export function useSetPassword() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: { token: string; password: string }) => unwrap(await api.POST('/auth/password/set', { body })),
    onSuccess: (me) => queryClient.setQueryData(meKey, me),
  })
}

/** The signed-in user inside a <RequireRole> route (always present there). */
export function useCurrentUser(): Me {
  const { data } = useMe()
  if (!data) throw new Error('useCurrentUser() must be used inside <RequireRole>')
  return data
}
