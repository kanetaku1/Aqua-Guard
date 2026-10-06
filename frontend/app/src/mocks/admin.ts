import type { components } from '@/api/schema'
import { farms } from './company'
import { users as authUsers } from './data'

type S = components['schemas']
type Role = S['Role']

/**
 * System Administration mock (AD-01〜04). The user directory follows the AD-01 wireframe; the four users that can
 * sign in (src/mocks/data.ts) are kept in sync, so deactivating or re-assigning them changes what they can open.
 * Times are UTC ("now" = 29 Sep 2026 09:35 WIB).
 */
type StoredUser = Omit<S['AdminUser'], 'canDeactivate' | 'canChangeRole' | 'onlyActiveTechnicalManagerOf'>

const ref = (id: string, name: string) => ({ id, name })
const YUSUF = ref('u-yusuf', 'Yusuf Rahman')

/**
 * Farm / Pond / device master (AD-02・AD-03 wireframes). Farm A has a 9th, fallow Pond; Farm E is not set up yet.
 * A Farm's Pond and device counts are derived from the Pond and device lists.
 */
type StoredFarm = Pick<S['AdminFarm'], 'id' | 'name' | 'location' | 'timeZone' | 'status' | 'updatedAt' | 'updatedBy'>
type StoredPond = Omit<S['AdminPond'], 'sensorCount' | 'actuatorCount'> & { farmId: string }
type StoredDevice = Omit<S['AdminDevice'], 'pond'>

const SENSORS: [S['SensorParameter'], string][] = [
  ['do', 'DO'],
  ['ph', 'PH'],
  ['temperature', 'TMP'],
  ['tds', 'TDS'],
  ['turbidity', 'TRB'],
  ['water_level', 'LVL'],
]
const AERATOR_SPEC = 'Paddlewheel · 2 HP'
const PUMP_SPEC = 'Inflow · 15 m³/h'
const SEEN = '2026-09-29T02:35:00Z' // last reading = now (09:35 WIB)

function seedMaster() {
  const NADIA = ref('u-nadia', 'Nadia Kurnia')
  const fromBusiness = (id: string, updatedAt: string): StoredFarm => {
    const f = farms.find((x) => x.id === id)!
    return { id, name: f.name, location: f.location, timeZone: 'Asia/Jakarta', status: 'active', updatedAt, updatedBy: YUSUF }
  }
  const farmList: StoredFarm[] = [
    fromBusiness('farm-a', '2026-09-02T03:00:00Z'),
    fromBusiness('farm-b', '2026-06-01T03:00:00Z'),
    fromBusiness('farm-c', '2026-06-01T03:00:00Z'),
    fromBusiness('farm-d', '2026-06-01T03:00:00Z'),
    { id: 'farm-e', name: 'Farm E', location: 'Sumbawa, West Nusa Tenggara', timeZone: 'Asia/Makassar', status: 'inactive', updatedAt: '2026-09-20T02:00:00Z', updatedBy: NADIA },
  ]
  const pondList: StoredPond[] = []
  const deviceList: StoredDevice[] = []
  /** aerators[i] / pumps[i]: per Pond (index 0 = Pond 01); offline: device IDs with their last reading. */
  const farm = (letter: string, farmId: string, areas: number[], aerators: number[], pumps: number[], fallow: number[] = [], offline: Record<string, string> = {}) =>
    areas.forEach((areaHa, i) => {
      const n = String(i + 1).padStart(2, '0')
      const pondId = `${farmId}-pond-${n}`
      const resting = fallow.includes(i + 1)
      pondList.push({ id: pondId, farmId, name: `Pond ${n}`, areaHa, status: resting ? 'fallow' : 'in_operation' })
      if (resting) return
      const code = `${letter}-P${n}`
      const add = (deviceId: string, type: S['DeviceType'], parameter: S['SensorParameter'] | null, spec: string | null) =>
        deviceList.push({ deviceId, type, pondId, parameter, spec, connection: offline[deviceId] ? 'offline' : 'online', lastSeenAt: offline[deviceId] ?? SEEN })
      for (const [parameter, suffix] of SENSORS) add(`${code}-${suffix}`, 'sensor', parameter, null)
      for (let a = 1; a <= aerators[i]; a++) add(`${code}-AER${a}`, 'aerator', null, AERATOR_SPEC)
      for (let m = 1; m <= pumps[i]; m++) add(`${code}-PMP${m}`, 'pump', null, PUMP_SPEC)
    })
  // Farm A: same devices as the TM screens (aerators 4 in Ponds 02 / 05, pumps in 02 / 05 / 08); the Pond 08 turbidity sensor is offline
  farm('A', 'farm-a', [0.4, 0.5, 0.4, 0.4, 0.5, 0.4, 0.4, 0.4, 0.4], [2, 4, 2, 2, 4, 2, 2, 2], [0, 1, 0, 0, 1, 0, 0, 1], [9], { 'A-P08-TRB': '2026-09-28T15:10:00Z' })
  farm('B', 'farm-b', Array(10).fill(0.4), Array(10).fill(2), [1, 1, 1, 1, 1, 1, 1, 1, 0, 0])
  farm('C', 'farm-c', Array(6).fill(0.4), Array(6).fill(2), [1, 1, 1, 1, 1, 0])
  farm('D', 'farm-d', Array(8).fill(0.4), Array(8).fill(2), [1, 1, 1, 1, 1, 1, 1, 0], [], { 'D-P06-AER2': '2026-09-29T00:20:00Z', 'D-P03-TRB': '2026-09-28T21:45:00Z' })
  return { farmList, pondList, deviceList }
}

let master = seedMaster()
export const farmStore = () => master.farmList
const farmRef = (id: string) => {
  const f = master.farmList.find((x) => x.id === id)!
  return { id: f.id, name: f.name }
}

function seed(): StoredUser[] {
  const user = (
    id: string,
    name: string,
    role: Role,
    farmId: string | null,
    status: S['UserStatus'],
    extra: Partial<StoredUser> = {},
  ): StoredUser => ({
    id,
    name,
    email: `${name.toLowerCase().replace(' ', '.')}@nusantarashrimp.co.id`,
    role,
    farm: farmId ? farmRef(farmId) : null,
    language: role === 'technical_manager' ? 'id' : 'en',
    status,
    invitedAt: '2026-06-02T03:00:00Z',
    invitedBy: YUSUF,
    invitationExpiresAt: null,
    activatedAt: status === 'invited' ? null : '2026-06-02T04:10:00Z',
    lastSignInAt: null,
    failedSignIns: 0,
    ...extra,
  })
  return [
    user('u-yusuf', 'Yusuf Rahman', 'system_administrator', null, 'active', { invitedAt: '2026-06-01T02:00:00Z', invitedBy: null, activatedAt: '2026-06-01T02:00:00Z', lastSignInAt: '2026-09-29T01:12:00Z' }),
    user('u-nadia', 'Nadia Kurnia', 'system_administrator', null, 'active', { lastSignInAt: '2026-09-26T07:03:00Z' }),
    user('u-hendra', 'Hendra Kusuma', 'farms_manager', null, 'active', { lastSignInAt: '2026-09-29T02:30:00Z' }),
    user('u-rina', 'Rina Hartono', 'farms_manager', null, 'invited', { invitedAt: '2026-09-28T03:00:00Z', invitationExpiresAt: '2026-10-01T03:00:00Z' }),
    user('u-sari', 'Sari Wijaya', 'technical_manager', 'farm-a', 'active', { language: 'en', lastSignInAt: '2026-09-29T02:20:00Z' }),
    user('u-budi', 'Budi Santoso', 'technical_manager', 'farm-b', 'active', { lastSignInAt: '2026-09-29T01:55:00Z', failedSignIns: 1 }),
    user('u-dewi', 'Dewi Lestari', 'technical_manager', 'farm-c', 'active', { lastSignInAt: '2026-09-29T00:40:00Z' }),
    user('u-agus', 'Agus Pratama', 'technical_manager', 'farm-d', 'active', { lastSignInAt: '2026-09-28T23:15:00Z' }),
    user('u-fajar', 'Fajar Nugroho', 'technical_manager', 'farm-d', 'invited', { invitedAt: '2026-09-29T01:00:00Z', invitationExpiresAt: '2026-10-02T01:00:00Z' }),
    user('u-eko', 'Eko Wibowo', 'technical_manager', 'farm-b', 'deactivated', { lastSignInAt: '2026-08-12T10:22:00Z' }),
  ]
}

export let adminUsers = seed()
let nextId = 1
const AUTH_SNAPSHOT = structuredClone(authUsers)

export function resetAdmin() {
  adminUsers = seed()
  master = seedMaster()
  nextId = 1
  authUsers.splice(0, authUsers.length, ...structuredClone(AUTH_SNAPSHOT))
}

const ROLE_ORDER: Role[] = ['system_administrator', 'farms_manager', 'technical_manager']
const activeAdmins = () => adminUsers.filter((u) => u.role === 'system_administrator' && u.status === 'active')

/** The caller first, deactivated last; otherwise SA → FM → TM (by Farm) → active before invited → name (spec: AdminUser). */
export function sortUsers(list: StoredUser[], callerId: string) {
  return [...list].sort(
    (a, b) =>
      Number(b.id === callerId) - Number(a.id === callerId) ||
      Number(a.status === 'deactivated') - Number(b.status === 'deactivated') ||
      ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role) ||
      (a.farm?.name ?? '').localeCompare(b.farm?.name ?? '') ||
      ['active', 'invited', 'deactivated'].indexOf(a.status) - ['active', 'invited', 'deactivated'].indexOf(b.status) ||
      a.name.localeCompare(b.name),
  )
}

/** The response shape: adds what the caller may do and the sole-TM warning. */
export function toAdminUser(u: StoredUser, callerId: string): S['AdminUser'] {
  const lastAdmin = u.role === 'system_administrator' && u.status === 'active' && activeAdmins().length <= 1
  const self = u.id === callerId
  const soleTm =
    u.role === 'technical_manager' &&
    u.status === 'active' &&
    u.farm &&
    !adminUsers.some((o) => o.id !== u.id && o.role === 'technical_manager' && o.status === 'active' && o.farm?.id === u.farm!.id)
  return {
    ...u,
    canDeactivate: !self && !lastAdmin && u.status !== 'deactivated',
    canChangeRole: !self && !lastAdmin,
    onlyActiveTechnicalManagerOf: soleTm ? u.farm : null,
  }
}

export const findUser = (id: string) => adminUsers.find((u) => u.id === id)

export function counts() {
  return {
    total: adminUsers.length,
    active: adminUsers.filter((u) => u.status === 'active').length,
    invited: adminUsers.filter((u) => u.status === 'invited').length,
    deactivated: adminUsers.filter((u) => u.status === 'deactivated').length,
  }
}

export function inviteUser(body: { name: string; email: string; role: Role; farmId?: string | null; language?: S['Language'] }, by: { id: string; name: string }, nowIso: string) {
  const id = `u-new-${nextId++}`
  const stored: StoredUser = {
    id,
    name: body.name.trim(),
    email: body.email.trim().toLowerCase(),
    role: body.role,
    farm: body.role === 'technical_manager' && body.farmId ? farmRef(body.farmId) : null,
    language: body.language ?? 'en',
    status: 'invited',
    invitedAt: nowIso,
    invitedBy: by,
    invitationExpiresAt: new Date(Date.parse(nowIso) + 72 * 3600_000).toISOString(),
    activatedAt: null,
    lastSignInAt: null,
    failedSignIns: 0,
  }
  adminUsers.push(stored)
  return stored
}

/** Apply a change and mirror it to the sign-in users (status, Role, Farm, header scope). */
export function updateUser(id: string, patch: Partial<Pick<StoredUser, 'role' | 'farm' | 'language' | 'status'>>) {
  const u = findUser(id)!
  Object.assign(u, patch)
  if (u.role !== 'technical_manager') u.farm = null
  const auth = authUsers.find((a) => a.id === id)
  if (auth) {
    auth.status = u.status
    auth.role = u.role
    auth.farm = u.farm
    auth.language = u.language
    auth.scopeLabel =
      u.role === 'system_administrator'
        ? 'System Administration'
        : u.role === 'farms_manager'
          ? `All Farms (${master.farmList.filter((f) => f.status === 'active').length})`
          : `${u.farm!.name} · ${master.farmList.find((f) => f.id === u.farm!.id)!.location.split(',')[0]}`
  }
  return u
}

/** Farm master for SA screens (AD-02〜04): no business data. Name order; Active TMs before invited ones. */
export function adminFarms(): S['AdminFarm'][] {
  return [...master.farmList].sort((a, b) => a.name.localeCompare(b.name)).map(toAdminFarm)
}

function toAdminFarm(f: StoredFarm): S['AdminFarm'] {
  const ponds = master.pondList.filter((p) => p.farmId === f.id)
  const devices = master.deviceList.filter((d) => ponds.some((p) => p.id === d.pondId))
  return {
    ...f,
    pondCount: ponds.length,
    pondsInOperation: ponds.filter((p) => p.status === 'in_operation').length,
    devicesOnline: devices.filter((d) => d.connection === 'online').length,
    devicesTotal: devices.length,
    technicalManagers: sortUsers(
      adminUsers.filter((u) => u.role === 'technical_manager' && u.status !== 'deactivated' && u.farm?.id === f.id),
      '',
    ).map((u) => ({ id: u.id, name: u.name, status: u.status as 'active' | 'invited' })),
  }
}

export const findFarm = (id: string) => master.farmList.find((f) => f.id === id)
export const getAdminFarm = (id: string) => {
  const f = findFarm(id)
  return f ? toAdminFarm(f) : undefined
}

export function createFarm(body: { name: string; location: string; timeZone?: S['AdminFarm']['timeZone'] }, by: { id: string; name: string }, nowIso: string) {
  const farm: StoredFarm = {
    id: `farm-new-${nextId++}`,
    name: body.name.trim(),
    location: body.location.trim(),
    timeZone: body.timeZone ?? 'Asia/Jakarta',
    // Always starts Inactive: Ponds, devices and a TM come first (AD-03)
    status: 'inactive',
    updatedAt: nowIso,
    updatedBy: by,
  }
  master.farmList.push(farm)
  return toAdminFarm(farm)
}

export function updateFarm(id: string, patch: Partial<Pick<StoredFarm, 'name' | 'location' | 'timeZone' | 'status'>>, by: { id: string; name: string }, nowIso: string) {
  const f = findFarm(id)!
  Object.assign(f, patch, { updatedAt: nowIso, updatedBy: by })
  // Keep the Farm name on assigned users in step
  for (const u of adminUsers) if (u.farm?.id === id) u.farm = { id, name: f.name }
  return toAdminFarm(f)
}

// ── Ponds ──

function toAdminPond(p: StoredPond): S['AdminPond'] {
  const devices = master.deviceList.filter((d) => d.pondId === p.id)
  const { farmId: _farmId, ...pond } = p
  return { ...pond, sensorCount: devices.filter((d) => d.type === 'sensor').length, actuatorCount: devices.filter((d) => d.type !== 'sensor').length }
}

export const findPond = (id: string) => master.pondList.find((p) => p.id === id)
export const pondsOf = (farmId: string) =>
  master.pondList.filter((p) => p.farmId === farmId).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })).map(toAdminPond)
export const pondNameTaken = (farmId: string, name: string, exceptId?: string) =>
  master.pondList.some((p) => p.farmId === farmId && p.id !== exceptId && p.name.toLowerCase() === name.trim().toLowerCase())

export function createPond(farmId: string, body: { name: string; areaHa: number; status?: S['AdminPond']['status'] }) {
  const pond: StoredPond = { id: `${farmId}-pond-new-${nextId++}`, farmId, name: body.name.trim(), areaHa: body.areaHa, status: body.status ?? 'in_operation' }
  master.pondList.push(pond)
  return toAdminPond(pond)
}

export function updatePond(id: string, body: { name: string; areaHa: number; status?: S['AdminPond']['status'] }) {
  const p = findPond(id)!
  Object.assign(p, { name: body.name.trim(), areaHa: body.areaHa, status: body.status ?? p.status })
  return toAdminPond(p)
}

// ── Devices ──

const TYPE_ORDER: S['DeviceType'][] = ['sensor', 'aerator', 'pump']
const PARAM_ORDER = SENSORS.map(([p]) => p)

function toAdminDevice(d: StoredDevice): S['AdminDevice'] {
  const p = findPond(d.pondId)!
  return { ...d, pond: { id: p.id, name: p.name } }
}

export const findDevice = (id: string) => master.deviceList.find((d) => d.deviceId.toLowerCase() === id.toLowerCase())

/** Pond order → sensors (parameter order) → aerators → pumps; Farm-wide counts for the card header and the tab badge. */
export function devicesOf(farmId: string) {
  const pondIds = master.pondList.filter((p) => p.farmId === farmId).map((p) => p.id)
  const all = master.deviceList
    .filter((d) => pondIds.includes(d.pondId))
    .map(toAdminDevice)
    .sort(
      (a, b) =>
        a.pond.name.localeCompare(b.pond.name, undefined, { numeric: true }) ||
        TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type) ||
        PARAM_ORDER.indexOf(a.parameter ?? 'do') - PARAM_ORDER.indexOf(b.parameter ?? 'do') ||
        a.deviceId.localeCompare(b.deviceId, undefined, { numeric: true }),
    )
  return {
    all,
    counts: {
      total: all.length,
      sensors: all.filter((d) => d.type === 'sensor').length,
      actuators: all.filter((d) => d.type !== 'sensor').length,
      // Never connected yet is not "offline"
      offline: all.filter((d) => d.connection === 'offline' && d.lastSeenAt).length,
    },
  }
}

export function createDevice(body: { deviceId: string; type: S['DeviceType']; pondId: string; parameter?: S['SensorParameter'] | null; spec?: string | null }) {
  const device: StoredDevice = {
    deviceId: body.deviceId.trim().toUpperCase(),
    type: body.type,
    pondId: body.pondId,
    parameter: body.type === 'sensor' ? (body.parameter ?? null) : null,
    spec: body.type === 'sensor' ? null : (body.spec?.trim() || null),
    // Shows as Online after its first reading
    connection: 'offline',
    lastSeenAt: null,
  }
  master.deviceList.push(device)
  return toAdminDevice(device)
}

export function updateDevice(id: string, body: { type?: S['DeviceType']; pondId?: string; parameter?: S['SensorParameter'] | null; spec?: string | null }) {
  const d = findDevice(id)!
  const type = body.type ?? d.type
  Object.assign(d, {
    type,
    pondId: body.pondId ?? d.pondId,
    parameter: type === 'sensor' ? (body.parameter !== undefined ? body.parameter : d.parameter) : null,
    spec: type === 'sensor' ? null : body.spec !== undefined ? body.spec?.trim() || null : d.spec,
  })
  return toAdminDevice(d)
}
