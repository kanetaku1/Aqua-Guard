import { HttpResponse, http } from 'msw'
import type { components } from '@/api/schema'
import {
  adminFarms,
  adminUsers,
  counts,
  createDevice,
  createFarm,
  createPond,
  devicesOf,
  findDevice,
  findFarm,
  findPond,
  findUser,
  getAdminFarm,
  inviteUser,
  pondNameTaken,
  pondsOf,
  sortUsers,
  toAdminUser,
  updateDevice,
  updateFarm,
  updatePond,
  updateUser,
} from '../admin'
import { NOW } from '../data'
import { BOUNDARIES, settings, thresholdErrors, thresholdsFor } from '../settings'
import { api, currentUser, problem } from '../http'

type S = components['schemas']
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** `/admin/*` is for the System Administrator only (02). */
function admin() {
  const user = currentUser()
  if (!user) return { denied: problem(401, 'unauthenticated', 'Not signed in') }
  if (user.role !== 'system_administrator') return { denied: problem(403, 'forbidden', 'Not allowed for this role') }
  return { user }
}

const invalid = (fieldErrors: { field: string; message: string }[]) => problem(422, 'validation_failed', 'Some fields are invalid', { fieldErrors })

/** TM needs exactly one active Farm; FM and SA have none (05 AD-01). */
function farmErrors(role: S['Role'], farmId: string | null | undefined) {
  if (role !== 'technical_manager') return []
  return farmId && adminFarms().some((f) => f.id === farmId) ? [] : [{ field: 'farmId', message: 'A Technical Manager needs an assigned Farm' }]
}

export const adminHandlers = [
  http.get(api('/admin/users'), ({ request }) => {
    const { user, denied } = admin()
    if (denied) return denied
    const url = new URL(request.url)
    const q = url.searchParams.get('q')?.trim().toLowerCase() ?? ''
    const role = url.searchParams.get('role')
    const status = url.searchParams.get('status')
    const farmId = url.searchParams.get('farmId')
    const page = Number(url.searchParams.get('page') ?? 1)
    const pageSize = Number(url.searchParams.get('pageSize') ?? 20)
    const all = sortUsers(adminUsers, user.id).filter(
      (u) =>
        (!q || `${u.name} ${u.email}`.toLowerCase().includes(q)) &&
        (!role || u.role === role) &&
        (!status || u.status === status) &&
        (!farmId || u.farm?.id === farmId),
    )
    return HttpResponse.json({
      items: all.slice((page - 1) * pageSize, page * pageSize).map((u) => toAdminUser(u, user.id)),
      page,
      pageSize,
      total: all.length,
      counts: counts(),
    })
  }),

  http.post(api('/admin/users'), async ({ request }) => {
    const { user, denied } = admin()
    if (denied) return denied
    const body = (await request.json()) as { name?: string; email?: string; role?: S['Role']; farmId?: string | null; language?: S['Language'] }
    const errors = [
      ...(body.name?.trim() ? [] : [{ field: 'name', message: 'Enter a name' }]),
      ...(body.email && EMAIL.test(body.email.trim()) ? [] : [{ field: 'email', message: 'Enter a valid email address' }]),
      ...(body.role ? farmErrors(body.role, body.farmId) : [{ field: 'role', message: 'Choose a Role' }]),
    ]
    if (errors.length) return invalid(errors)
    if (adminUsers.some((u) => u.email === body.email!.trim().toLowerCase())) {
      return problem(409, 'email_taken', 'A user with this email already exists', { fieldErrors: [{ field: 'email', message: 'A user with this email already exists' }] })
    }
    // Mock clock: the invitation is sent "now" (29 Sep 09:35 WIB)
    const created = inviteUser(body as Parameters<typeof inviteUser>[0], { id: user.id, name: user.name }, NOW)
    return HttpResponse.json(toAdminUser(created, user.id), { status: 201 })
  }),

  http.get(api('/admin/users/:userId'), ({ params }) => {
    const { user, denied } = admin()
    if (denied) return denied
    const u = findUser(params.userId as string)
    return u ? HttpResponse.json(toAdminUser(u, user.id)) : problem(404, 'not_found', 'User not found')
  }),

  http.patch(api('/admin/users/:userId'), async ({ params, request }) => {
    const { user, denied } = admin()
    if (denied) return denied
    const u = findUser(params.userId as string)
    if (!u) return problem(404, 'not_found', 'User not found')
    const body = (await request.json()) as { role?: S['Role']; farmId?: string | null; language?: S['Language'] }
    const role = body.role ?? u.role
    if (role !== u.role && !toAdminUser(u, user.id).canChangeRole) {
      return problem(409, u.id === user.id ? 'self_change' : 'last_admin', u.id === user.id ? 'You cannot change your own Role' : 'The last System Administrator must keep the Role')
    }
    const farmId = body.farmId !== undefined ? body.farmId : u.farm?.id
    const errors = farmErrors(role, farmId)
    if (errors.length) return invalid(errors)
    const farm = role === 'technical_manager' ? (adminFarms().find((f) => f.id === farmId)! as { id: string; name: string }) : null
    const updated = updateUser(u.id, { role, farm: farm && { id: farm.id, name: farm.name }, language: body.language ?? u.language })
    return HttpResponse.json(toAdminUser(updated, user.id))
  }),

  http.post(api('/admin/users/:userId/resend-invitation'), ({ params }) => {
    const { denied } = admin()
    if (denied) return denied
    const u = findUser(params.userId as string)
    if (!u) return problem(404, 'not_found', 'User not found')
    if (u.status !== 'invited') return problem(409, 'not_invited', 'Only invited users can be sent a new invitation')
    u.invitedAt = NOW
    u.invitationExpiresAt = new Date(Date.parse(NOW) + 72 * 3600_000).toISOString()
    return new HttpResponse(null, { status: 202 })
  }),

  http.post(api('/admin/users/:userId/send-password-reset'), ({ params }) => {
    const { denied } = admin()
    if (denied) return denied
    return findUser(params.userId as string) ? new HttpResponse(null, { status: 202 }) : problem(404, 'not_found', 'User not found')
  }),

  http.post(api('/admin/users/:userId/deactivate'), ({ params }) => {
    const { user, denied } = admin()
    if (denied) return denied
    const u = findUser(params.userId as string)
    if (!u) return problem(404, 'not_found', 'User not found')
    if (!toAdminUser(u, user.id).canDeactivate) {
      return problem(409, u.id === user.id ? 'self_deactivate' : 'last_admin', u.id === user.id ? 'You cannot deactivate yourself' : 'The last System Administrator cannot be deactivated')
    }
    return HttpResponse.json(toAdminUser(updateUser(u.id, { status: 'deactivated' }), user.id))
  }),

  http.post(api('/admin/users/:userId/reactivate'), ({ params }) => {
    const { user, denied } = admin()
    if (denied) return denied
    const u = findUser(params.userId as string)
    if (!u) return problem(404, 'not_found', 'User not found')
    // A user who never set a password goes back to Invited
    return HttpResponse.json(toAdminUser(updateUser(u.id, { status: u.activatedAt ? 'active' : 'invited' }), user.id))
  }),

  http.get(api('/admin/farms'), () => {
    const { denied } = admin()
    if (denied) return denied
    return HttpResponse.json({ items: adminFarms() })
  }),

  http.post(api('/admin/farms'), async ({ request }) => {
    const { user, denied } = admin()
    if (denied) return denied
    const body = (await request.json()) as { name?: string; location?: string; timeZone?: S['AdminFarm']['timeZone'] }
    const errors = [
      ...(body.name?.trim() ? [] : [{ field: 'name', message: 'Enter a Farm name' }]),
      ...(body.location?.trim() ? [] : [{ field: 'location', message: 'Enter the location' }]),
    ]
    if (errors.length) return invalid(errors)
    if (adminFarms().some((f) => f.name.toLowerCase() === body.name!.trim().toLowerCase())) {
      return problem(409, 'farm_name_taken', 'A Farm with this name already exists', { fieldErrors: [{ field: 'name', message: 'A Farm with this name already exists' }] })
    }
    return HttpResponse.json(createFarm(body as Parameters<typeof createFarm>[0], { id: user.id, name: user.name }, NOW), { status: 201 })
  }),

  // ── AD-03 Farm Detail ──

  http.get(api('/admin/farms/:farmId'), ({ params }) => {
    const { denied } = admin()
    if (denied) return denied
    const farm = getAdminFarm(params.farmId as string)
    return farm ? HttpResponse.json(farm) : problem(404, 'not_found', 'Farm not found')
  }),

  http.patch(api('/admin/farms/:farmId'), async ({ params, request }) => {
    const { user, denied } = admin()
    if (denied) return denied
    const farm = findFarm(params.farmId as string)
    if (!farm) return problem(404, 'not_found', 'Farm not found')
    const body = (await request.json()) as { name?: string; location?: string; timeZone?: S['AdminFarm']['timeZone']; status?: 'active' | 'inactive' }
    const errors = [
      ...(body.name?.trim() ? [] : [{ field: 'name', message: 'Enter a Farm name' }]),
      ...(body.location?.trim() ? [] : [{ field: 'location', message: 'Enter the location' }]),
    ]
    if (errors.length) return invalid(errors)
    if (adminFarms().some((f) => f.id !== farm.id && f.name.toLowerCase() === body.name!.trim().toLowerCase())) {
      return problem(409, 'farm_name_taken', 'A Farm with this name already exists', { fieldErrors: [{ field: 'name', message: 'A Farm with this name already exists' }] })
    }
    const updated = updateFarm(
      farm.id,
      { name: body.name!.trim(), location: body.location!.trim(), timeZone: body.timeZone ?? farm.timeZone, status: body.status ?? farm.status },
      { id: user.id, name: user.name },
      NOW,
    )
    return HttpResponse.json(updated)
  }),

  http.get(api('/admin/farms/:farmId/ponds'), ({ params }) => {
    const { denied } = admin()
    if (denied) return denied
    if (!findFarm(params.farmId as string)) return problem(404, 'not_found', 'Farm not found')
    return HttpResponse.json({ items: pondsOf(params.farmId as string) })
  }),

  http.post(api('/admin/farms/:farmId/ponds'), async ({ params, request }) => {
    const { denied } = admin()
    if (denied) return denied
    const farmId = params.farmId as string
    if (!findFarm(farmId)) return problem(404, 'not_found', 'Farm not found')
    const body = (await request.json()) as { name?: string; areaHa?: number; status?: S['AdminPond']['status'] }
    const errors = pondErrors(body)
    if (errors.length) return invalid(errors)
    if (pondNameTaken(farmId, body.name!)) return pondNameConflict()
    return HttpResponse.json(createPond(farmId, body as Parameters<typeof createPond>[1]), { status: 201 })
  }),

  http.patch(api('/admin/ponds/:pondId'), async ({ params, request }) => {
    const { denied } = admin()
    if (denied) return denied
    const pond = findPond(params.pondId as string)
    if (!pond) return problem(404, 'not_found', 'Pond not found')
    const body = (await request.json()) as { name?: string; areaHa?: number; status?: S['AdminPond']['status'] }
    const errors = pondErrors(body)
    if (errors.length) return invalid(errors)
    if (pondNameTaken(pond.farmId, body.name!, pond.id)) return pondNameConflict()
    return HttpResponse.json(updatePond(pond.id, body as Parameters<typeof updatePond>[1]))
  }),

  http.get(api('/admin/farms/:farmId/devices'), ({ params, request }) => {
    const { denied } = admin()
    if (denied) return denied
    if (!findFarm(params.farmId as string)) return problem(404, 'not_found', 'Farm not found')
    const url = new URL(request.url)
    const pondId = url.searchParams.get('pondId')
    const type = url.searchParams.get('type')
    const connection = url.searchParams.get('connection')
    const page = Number(url.searchParams.get('page') ?? 1)
    const pageSize = Number(url.searchParams.get('pageSize') ?? 20)
    const { all, counts: deviceCounts } = devicesOf(params.farmId as string)
    const rows = all.filter((d) => (!pondId || d.pond.id === pondId) && (!type || d.type === type) && (!connection || d.connection === connection))
    return HttpResponse.json({ items: rows.slice((page - 1) * pageSize, page * pageSize), page, pageSize, total: rows.length, counts: deviceCounts })
  }),

  http.post(api('/admin/farms/:farmId/devices'), async ({ params, request }) => {
    const { denied } = admin()
    if (denied) return denied
    const farmId = params.farmId as string
    if (!findFarm(farmId)) return problem(404, 'not_found', 'Farm not found')
    const body = (await request.json()) as Parameters<typeof createDevice>[0]
    const errors = [
      ...(body.deviceId?.trim() ? [] : [{ field: 'deviceId', message: 'Enter the Device ID' }]),
      ...deviceErrors(farmId, body),
    ]
    if (errors.length) return invalid(errors)
    if (findDevice(body.deviceId.trim())) {
      return problem(409, 'device_id_taken', 'This Device ID is already registered', { fieldErrors: [{ field: 'deviceId', message: 'This Device ID is already registered' }] })
    }
    return HttpResponse.json(createDevice(body), { status: 201 })
  }),

  http.patch(api('/admin/devices/:deviceId'), async ({ params, request }) => {
    const { denied } = admin()
    if (denied) return denied
    const device = findDevice(params.deviceId as string)
    if (!device) return problem(404, 'not_found', 'Device not found')
    const body = (await request.json()) as Parameters<typeof updateDevice>[1]
    const farmId = findPond(device.pondId)!.farmId
    const errors = deviceErrors(farmId, { type: body.type ?? device.type, pondId: body.pondId ?? device.pondId, parameter: body.parameter !== undefined ? body.parameter : device.parameter })
    if (errors.length) return invalid(errors)
    return HttpResponse.json(updateDevice(device.deviceId, body))
  }),

  // ── AD-04 Settings ──

  http.get(api('/admin/settings/thresholds'), ({ request }) => {
    const { denied } = admin()
    if (denied) return denied
    const farmId = new URL(request.url).searchParams.get('farmId')
    if (farmId && !findFarm(farmId)) return problem(404, 'not_found', 'Farm not found')
    return HttpResponse.json(thresholdsFor(farmId, adminFarms().map((f) => ({ id: f.id, name: f.name }))))
  }),

  http.put(api('/admin/settings/thresholds'), async ({ request }) => {
    const { user, denied } = admin()
    if (denied) return denied
    const farmId = new URL(request.url).searchParams.get('farmId')
    if (farmId && !findFarm(farmId)) return problem(404, 'not_found', 'Farm not found')
    const { items } = (await request.json()) as { items: S['Threshold'][] }
    const errors = thresholdErrors(items)
    if (errors.length) return invalid(errors)
    const by = { id: user.id, name: user.name }
    // Keep the side each parameter can have (read-only), whatever was sent
    const clean = items.map((t) => {
      const base = settings.defaults.find((d) => d.parameter === t.parameter)!
      const row = { ...base, ...Object.fromEntries(BOUNDARIES.map((b) => [b, t[b] ?? null])) }
      if (base.sides === 'low') Object.assign(row, { attentionHigh: null, warningHigh: null, criticalHigh: null })
      if (base.sides === 'high') Object.assign(row, { criticalLow: null, warningLow: null, attentionLow: null })
      return row
    })
    if (farmId) {
      if (clean.length) settings.overrides.set(farmId, { rows: clean, updatedAt: NOW, updatedBy: by })
      else settings.overrides.delete(farmId)
    } else {
      settings.defaults = settings.defaults.map((d) => clean.find((c) => c.parameter === d.parameter) ?? d)
      settings.defaultsMeta = { updatedAt: NOW, updatedBy: by }
    }
    return HttpResponse.json(thresholdsFor(farmId, adminFarms().map((f) => ({ id: f.id, name: f.name }))))
  }),

  http.get(api('/admin/settings/growth-targets'), () => {
    const { denied } = admin()
    if (denied) return denied
    return HttpResponse.json(settings.growth)
  }),

  http.put(api('/admin/settings/growth-targets'), async ({ request }) => {
    const { user, denied } = admin()
    if (denied) return denied
    const body = (await request.json()) as { points: S['GrowthTargetPoint'][]; onTrackBandPct: number }
    const errors: { field: string; message: string }[] = []
    if (body.points.length < 2) errors.push({ field: 'points', message: 'Enter at least two points' })
    body.points.forEach((p, i) => {
      const prev = body.points[i - 1]
      if (!Number.isInteger(p.doc) || p.doc < 0 || (prev && p.doc <= prev.doc)) errors.push({ field: `points/${i}/doc`, message: 'DOC must increase' })
      if (!(p.targetAbwG > 0) || (prev && p.targetAbwG <= prev.targetAbwG)) errors.push({ field: `points/${i}/targetAbwG`, message: 'Target ABW must increase with DOC' })
    })
    if (!(body.onTrackBandPct >= 1 && body.onTrackBandPct <= 50)) errors.push({ field: 'onTrackBandPct', message: 'Enter 1–50%' })
    if (errors.length) return invalid(errors)
    settings.growth = { ...body, updatedAt: NOW, updatedBy: { id: user.id, name: user.name } }
    return HttpResponse.json(settings.growth)
  }),

  http.get(api('/admin/settings/rules'), () => {
    const { denied } = admin()
    if (denied) return denied
    return HttpResponse.json(settings.rules)
  }),

  http.put(api('/admin/settings/rules'), async ({ request }) => {
    const { user, denied } = admin()
    if (denied) return denied
    const body = (await request.json()) as S['RuleSettingsInput']
    const errors: { field: string; message: string }[] = []
    if (!(body.sensorOfflineAfterMinutes > body.sensorDelayedAfterMinutes)) errors.push({ field: 'sensorOfflineAfterMinutes', message: 'Must be longer than Delayed' })
    if (!(body.productionWarningPct > body.productionAttentionPct)) errors.push({ field: 'productionWarningPct', message: 'Must be above Attention' })
    if (errors.length) return invalid(errors)
    settings.rules = { ...body, updatedAt: NOW, updatedBy: { id: user.id, name: user.name } }
    return HttpResponse.json(settings.rules)
  }),
]

function pondErrors(body: { name?: string; areaHa?: number }) {
  return [
    ...(body.name?.trim() ? [] : [{ field: 'name', message: 'Enter a Pond name' }]),
    ...(typeof body.areaHa === 'number' && body.areaHa > 0 ? [] : [{ field: 'areaHa', message: 'Enter an area above 0 ha' }]),
  ]
}

const pondNameConflict = () =>
  problem(409, 'pond_name_taken', 'This Farm already has a Pond with this name', { fieldErrors: [{ field: 'name', message: 'This Farm already has a Pond with this name' }] })

/** A device belongs to a Pond of this Farm; a sensor says what it measures. */
function deviceErrors(farmId: string, body: { type?: S['DeviceType']; pondId?: string; parameter?: S['SensorParameter'] | null }) {
  const pond = body.pondId ? findPond(body.pondId) : undefined
  return [
    ...(body.type ? [] : [{ field: 'type', message: 'Choose a type' }]),
    ...(pond && pond.farmId === farmId ? [] : [{ field: 'pondId', message: 'Choose a Pond of this Farm' }]),
    ...(body.type === 'sensor' && !body.parameter ? [{ field: 'parameter', message: 'Choose what the sensor measures' }] : []),
  ]
}
