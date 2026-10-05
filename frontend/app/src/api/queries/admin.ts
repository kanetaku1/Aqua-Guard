import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, unwrap } from '../client'
import type { components } from '../schema'

type S = components['schemas']
export type UserFilters = { q?: string; role?: S['Role']; status?: S['UserStatus']; farmId?: string; page: number; pageSize: number }

/** AD-01 User List (AD-U-001). Master data, not live — no polling. */
export function useAdminUsers(filters: UserFilters) {
  return useQuery({
    queryKey: ['admin', 'users', filters],
    queryFn: async () => unwrap(await api.GET('/admin/users', { params: { query: filters } })),
    placeholderData: keepPreviousData,
  })
}

export function useAdminUser(userId: string | null) {
  return useQuery({
    queryKey: ['admin', 'user', userId],
    queryFn: async () => unwrap(await api.GET('/admin/users/{userId}', { params: { path: { userId: userId ?? '' } } })),
    enabled: !!userId,
  })
}

/** Farm master (AD-02〜04; Farm choices in AD-01). */
export function useAdminFarms() {
  return useQuery({
    queryKey: ['admin', 'farms'],
    queryFn: async () => unwrap(await api.GET('/admin/farms')),
  })
}

/** AD-F-002 Add farm: the new Farm starts Inactive. */
export function useCreateFarm() {
  const invalidate = useInvalidateAdmin()
  return useMutation({
    mutationFn: async (body: { name: string; location: string; timeZone: S['AdminFarm']['timeZone'] }) => unwrap(await api.POST('/admin/farms', { body })),
    onSuccess: invalidate,
  })
}

function useInvalidateAdmin() {
  const queryClient = useQueryClient()
  return () => void queryClient.invalidateQueries({ queryKey: ['admin'] })
}

export function useInviteUser() {
  const invalidate = useInvalidateAdmin()
  return useMutation({
    mutationFn: async (body: { name: string; email: string; role: S['Role']; farmId: string | null; language: S['Language'] }) =>
      unwrap(await api.POST('/admin/users', { body })),
    onSuccess: invalidate,
  })
}

/** AD-U-003〜005 for one user. */
export function useUserMutations(userId: string) {
  const invalidate = useInvalidateAdmin()
  const path = { params: { path: { userId } } }
  return {
    update: useMutation({
      mutationFn: async (body: { role?: S['Role']; farmId?: string | null; language?: S['Language'] }) =>
        unwrap(await api.PATCH('/admin/users/{userId}', { ...path, body })),
      onSuccess: invalidate,
    }),
    resendInvitation: useMutation({
      mutationFn: async () => unwrap(await api.POST('/admin/users/{userId}/resend-invitation', path)),
      onSuccess: invalidate,
    }),
    sendPasswordReset: useMutation({
      mutationFn: async () => unwrap(await api.POST('/admin/users/{userId}/send-password-reset', path)),
    }),
    deactivate: useMutation({
      mutationFn: async () => unwrap(await api.POST('/admin/users/{userId}/deactivate', path)),
      onSuccess: invalidate,
    }),
    reactivate: useMutation({
      mutationFn: async () => unwrap(await api.POST('/admin/users/{userId}/reactivate', path)),
      onSuccess: invalidate,
    }),
  }
}

// ── AD-03 Farm Detail ──

export function useAdminFarm(farmId: string) {
  return useQuery({
    queryKey: ['admin', 'farm', farmId],
    queryFn: async () => unwrap(await api.GET('/admin/farms/{farmId}', { params: { path: { farmId } } })),
  })
}

export function useUpdateFarm(farmId: string) {
  const invalidate = useInvalidateAdmin()
  return useMutation({
    mutationFn: async (body: S['AdminFarmInput']) => unwrap(await api.PATCH('/admin/farms/{farmId}', { params: { path: { farmId } }, body })),
    onSuccess: invalidate,
  })
}

export function useAdminPonds(farmId: string) {
  return useQuery({
    queryKey: ['admin', 'farm', farmId, 'ponds'],
    queryFn: async () => unwrap(await api.GET('/admin/farms/{farmId}/ponds', { params: { path: { farmId } } })),
  })
}

/** Add a Pond, or update one when `pondId` is given (AD-F-004). */
export function useSavePond(farmId: string) {
  const invalidate = useInvalidateAdmin()
  return useMutation({
    mutationFn: async ({ pondId, body }: { pondId: string | null; body: S['AdminPondInput'] }) =>
      pondId
        ? unwrap(await api.PATCH('/admin/ponds/{pondId}', { params: { path: { pondId } }, body }))
        : unwrap(await api.POST('/admin/farms/{farmId}/ponds', { params: { path: { farmId } }, body })),
    onSuccess: invalidate,
  })
}

export type DeviceFilters = { pondId?: string; type?: S['DeviceType']; connection?: S['Connection']; page: number; pageSize: number }

export function useAdminDevices(farmId: string, filters: DeviceFilters) {
  return useQuery({
    queryKey: ['admin', 'farm', farmId, 'devices', filters],
    queryFn: async () => unwrap(await api.GET('/admin/farms/{farmId}/devices', { params: { path: { farmId }, query: filters } })),
    placeholderData: keepPreviousData,
  })
}

/** Register a device, or change its assignment when `existing` is set (AD-F-005). */
export function useSaveDevice(farmId: string) {
  const invalidate = useInvalidateAdmin()
  return useMutation({
    mutationFn: async ({ existing, body }: { existing: boolean; body: S['AdminDeviceInput'] }) => {
      if (!existing) return unwrap(await api.POST('/admin/farms/{farmId}/devices', { params: { path: { farmId } }, body }))
      const { deviceId, ...update } = body
      return unwrap(await api.PATCH('/admin/devices/{deviceId}', { params: { path: { deviceId } }, body: update }))
    },
    onSuccess: invalidate,
  })
}

// ── AD-04 Settings ──

export function useThresholds(farmId: string | null) {
  return useQuery({
    queryKey: ['admin', 'settings', 'thresholds', farmId],
    queryFn: async () => unwrap(await api.GET('/admin/settings/thresholds', { params: { query: { farmId: farmId ?? undefined } } })),
  })
}

export function useSaveThresholds(farmId: string | null) {
  const invalidate = useInvalidateAdmin()
  return useMutation({
    mutationFn: async (items: S['Threshold'][]) =>
      unwrap(await api.PUT('/admin/settings/thresholds', { params: { query: { farmId: farmId ?? undefined } }, body: { items } })),
    onSuccess: invalidate,
  })
}

export function useGrowthTargets() {
  return useQuery({
    queryKey: ['admin', 'settings', 'growth'],
    queryFn: async () => unwrap(await api.GET('/admin/settings/growth-targets')),
  })
}

export function useSaveGrowthTargets() {
  const invalidate = useInvalidateAdmin()
  return useMutation({
    mutationFn: async (body: { points: S['GrowthTargetPoint'][]; onTrackBandPct: number }) => unwrap(await api.PUT('/admin/settings/growth-targets', { body })),
    onSuccess: invalidate,
  })
}

export function useRules() {
  return useQuery({
    queryKey: ['admin', 'settings', 'rules'],
    queryFn: async () => unwrap(await api.GET('/admin/settings/rules')),
  })
}

export function useSaveRules() {
  const invalidate = useInvalidateAdmin()
  return useMutation({
    mutationFn: async (body: S['RuleSettingsInput']) => unwrap(await api.PUT('/admin/settings/rules', { body })),
    onSuccess: invalidate,
  })
}
