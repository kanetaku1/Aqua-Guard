import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { PostgresService } from '../infrastructure/postgres.service';
import { ApiProblem } from '../http/problem';
import { inputObject, invalid, optionalEnum } from './admin-input';
import { PasswordLinksService } from '../auth/password-links.service';

type Role = 'system_administrator' | 'farms_manager' | 'technical_manager';
type Status = 'invited' | 'active' | 'deactivated';
type Language = 'en' | 'id';
const ROLES: Role[] = ['system_administrator', 'farms_manager', 'technical_manager'];
const STATUSES: Status[] = ['invited', 'active', 'deactivated'];

interface UserRow {
  id: string;
  public_id: string;
  name: string;
  email: string;
  role: Role;
  status: Status;
  language: Language;
  invited_at: Date | null;
  activated_at: Date | null;
  last_sign_in_at: Date | null;
  failed_login_count: number;
  farm_uuid: string | null;
  farm_public_id: string | null;
  farm_name: string | null;
  inviter_public_id: string | null;
  inviter_name: string | null;
  invitation_expires_at: Date | null;
  active_admin_count: string;
  active_tm_count: string;
}

export interface AdminUser {
  id: string; name: string; email: string; role: Role;
  farm: { id: string; name: string } | null;
  language: Language; status: Status;
  invitedAt: string | null;
  invitedBy: { id: string; name: string } | null;
  invitationExpiresAt: string | null;
  activatedAt: string | null;
  lastSignInAt: string | null;
  failedSignIns: number;
  canDeactivate: boolean;
  canChangeRole: boolean;
  onlyActiveTechnicalManagerOf: { id: string; name: string } | null;
}

export interface UserScope {
  companyId: string;
  actorId: string;
}

type Search = Record<string, string | undefined>;

function parsePage(value: string | undefined, fallback: number, maximum?: number): number {
  if (value === undefined) return fallback;
  if (!/^\d+$/.test(value)) throw invalid(maximum ? 'pageSize' : 'page', 'Must be an integer');
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1 || (maximum && number > maximum)) {
    throw invalid(maximum ? 'pageSize' : 'page', `Must be between 1 and ${maximum ?? 'the maximum'}`);
  }
  return number;
}

function farmRef(row: UserRow): AdminUser['farm'] {
  return row.farm_public_id && row.farm_name
    ? { id: row.farm_public_id, name: row.farm_name } : null;
}

function toAdminUser(row: UserRow, actorId: string): AdminUser {
  const self = row.id === actorId;
  const lastAdmin = row.role === 'system_administrator'
    && row.status === 'active' && Number(row.active_admin_count) <= 1;
  const soleTm = row.role === 'technical_manager'
    && row.status === 'active' && Number(row.active_tm_count) === 1;
  return {
    id: row.public_id, name: row.name, email: row.email, role: row.role,
    farm: farmRef(row), language: row.language, status: row.status,
    invitedAt: row.invited_at?.toISOString() ?? null,
    invitedBy: row.inviter_public_id && row.inviter_name
      ? { id: row.inviter_public_id, name: row.inviter_name } : null,
    invitationExpiresAt: row.status === 'invited'
      ? row.invitation_expires_at?.toISOString() ?? null : null,
    activatedAt: row.activated_at?.toISOString() ?? null,
    lastSignInAt: row.last_sign_in_at?.toISOString() ?? null,
    failedSignIns: row.failed_login_count,
    canDeactivate: !self && !lastAdmin && row.status !== 'deactivated',
    canChangeRole: !self && !lastAdmin,
    onlyActiveTechnicalManagerOf: soleTm ? farmRef(row) : null,
  };
}

function userOrder(left: UserRow, right: UserRow, actorId: string): number {
  const self = Number(right.id === actorId) - Number(left.id === actorId);
  const inactive = Number(left.status === 'deactivated') - Number(right.status === 'deactivated');
  const role = ROLES.indexOf(left.role) - ROLES.indexOf(right.role);
  const farm = (left.farm_name ?? '').localeCompare(right.farm_name ?? '');
  const status = STATUSES.indexOf(left.status) - STATUSES.indexOf(right.status);
  return self || inactive || role || farm || status || left.name.localeCompare(right.name);
}

@Injectable()
export class AdminUsersService {
  constructor(
    private readonly postgres: PostgresService,
    private readonly links: PasswordLinksService,
  ) {}

  async invite(scope: UserScope, body: unknown): Promise<AdminUser> {
    const data = inputObject(body);
    if (typeof data.name !== 'string' || !data.name.trim()) throw invalid('name', 'Enter a name');
    if (typeof data.email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
      throw invalid('email', 'Enter a valid email address');
    }
    if (typeof data.role !== 'string' || !ROLES.includes(data.role as Role)) {
      throw invalid('role', 'Choose a Role');
    }
    const role = data.role as Role;
    const language = optionalEnum(data.language, 'language', ['en', 'id'], 'en');
    if (role === 'technical_manager' && (typeof data.farmId !== 'string' || !data.farmId)) {
      throw invalid('farmId', 'A Technical Manager needs an assigned Farm');
    }
    if (role !== 'technical_manager' && data.farmId !== undefined && data.farmId !== null) {
      throw invalid('farmId', 'Only a Technical Manager can have an assigned Farm');
    }
    const email = data.email.trim().toLowerCase();
    const publicId = `user-${randomUUID()}`;
    const client = await this.postgres.pool.connect();
    let token: string;
    try {
      await client.query('BEGIN');
      await this.lockCompany(client, scope.companyId);
      let farmUuid: string | null = null;
      if (role === 'technical_manager') {
        const farm = await client.query<{ id: string }>(
          'SELECT id FROM farms WHERE company_id = $1 AND public_id = $2',
          [scope.companyId, data.farmId],
        );
        if (!farm.rows[0]) throw invalid('farmId', 'Farm does not belong to this Company');
        farmUuid = farm.rows[0].id;
      }
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO users (public_id, company_id, name, email, role, status,
          language, invited_at, invited_by_user_id)
         VALUES ($1, $2, $3, $4, $5, 'invited', $6, now(), $7) RETURNING id`,
        [publicId, scope.companyId, data.name.trim(), email, role, language, scope.actorId],
      );
      if (farmUuid) {
        await client.query(
          'INSERT INTO user_farm_assignments (user_id, farm_id, assigned_at) VALUES ($1, $2, now())',
          [inserted.rows[0].id, farmUuid],
        );
      }
      token = await this.links.issue(client, inserted.rows[0].id, 'invite');
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23505') {
        throw new ApiProblem(409, 'email_taken', 'A user with this email already exists', {
          fieldErrors: [{ field: 'email', message: 'Already in use' }],
        });
      }
      throw error;
    } finally { client.release(); }
    await this.deliver(email, 'invite', token);
    return this.get(scope, publicId);
  }

  async resendInvitation(scope: UserScope, userId: string): Promise<void> {
    const client = await this.postgres.pool.connect();
    let delivery: { email: string; token: string };
    try {
      await client.query('BEGIN');
      await this.lockCompany(client, scope.companyId);
      const target = await client.query<{ id: string; email: string; status: Status }>(
        'SELECT id, email, status FROM users WHERE company_id = $1 AND public_id = $2 FOR UPDATE',
        [scope.companyId, userId],
      );
      const user = target.rows[0];
      if (!user) throw new ApiProblem(404, 'not_found', 'User not found');
      if (user.status !== 'invited') {
        throw new ApiProblem(409, 'not_invited', 'Only invited users can be sent an invitation');
      }
      await client.query('UPDATE users SET invited_at = now(), updated_at = now() WHERE id = $1',
        [user.id]);
      delivery = { email: user.email, token: await this.links.issue(client, user.id, 'invite') };
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
    await this.deliver(delivery.email, 'invite', delivery.token);
  }

  async sendPasswordReset(scope: UserScope, userId: string): Promise<void> {
    const client = await this.postgres.pool.connect();
    let delivery: { email: string; token: string };
    try {
      await client.query('BEGIN');
      await this.lockCompany(client, scope.companyId);
      const target = await client.query<{ id: string; email: string; status: Status }>(
        'SELECT id, email, status FROM users WHERE company_id = $1 AND public_id = $2 FOR UPDATE',
        [scope.companyId, userId],
      );
      const user = target.rows[0];
      if (!user) throw new ApiProblem(404, 'not_found', 'User not found');
      if (user.status !== 'active') {
        throw new ApiProblem(409, 'not_active', 'Only active users can reset a password');
      }
      delivery = { email: user.email, token: await this.links.issue(client, user.id, 'reset') };
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
    await this.deliver(delivery.email, 'reset', delivery.token);
  }

  private async deliver(email: string, purpose: 'invite' | 'reset', token: string): Promise<void> {
    try {
      await this.links.deliver(email, purpose, token);
    } catch {
      throw new ApiProblem(503, 'mail_unavailable', 'Mail delivery failed');
    }
  }

  async list(scope: UserScope, search: Search): Promise<{
    items: AdminUser[]; page: number; pageSize: number; total: number;
    counts: { total: number; active: number; invited: number; deactivated: number };
  }> {
    const page = parsePage(search.page, 1);
    const pageSize = parsePage(search.pageSize, 20, 100);
    if (search.role && !ROLES.includes(search.role as Role)) throw invalid('role', 'Unknown Role');
    if (search.status && !STATUSES.includes(search.status as Status)) {
      throw invalid('status', 'Unknown status');
    }
    const all = await this.rows(scope.companyId);
    const counts = {
      total: all.length,
      active: all.filter((row) => row.status === 'active').length,
      invited: all.filter((row) => row.status === 'invited').length,
      deactivated: all.filter((row) => row.status === 'deactivated').length,
    };
    const query = search.q?.trim().toLocaleLowerCase() ?? '';
    const filtered = all.filter((row) =>
      (!query || `${row.name} ${row.email}`.toLocaleLowerCase().includes(query))
      && (!search.role || row.role === search.role)
      && (!search.status || row.status === search.status)
      && (!search.farmId || row.farm_public_id === search.farmId),
    ).sort((left, right) => userOrder(left, right, scope.actorId));
    return {
      items: filtered.slice((page - 1) * pageSize, page * pageSize)
        .map((row) => toAdminUser(row, scope.actorId)),
      page, pageSize, total: filtered.length, counts,
    };
  }

  async get(scope: UserScope, userId: string): Promise<AdminUser> {
    const row = (await this.rows(scope.companyId)).find((item) => item.public_id === userId);
    if (!row) throw new ApiProblem(404, 'not_found', 'User not found');
    return toAdminUser(row, scope.actorId);
  }

  async update(scope: UserScope, userId: string, body: unknown): Promise<AdminUser> {
    const data = inputObject(body);
    const client = await this.postgres.pool.connect();
    try {
      await client.query('BEGIN');
      await this.lockCompany(client, scope.companyId);
      const target = await this.lockUser(client, scope.companyId, userId);
      const role = optionalEnum(data.role, 'role', ROLES, target.role);
      const language = optionalEnum(data.language, 'language', ['en', 'id'], target.language);
      if (role !== target.role && target.id === scope.actorId) {
        throw new ApiProblem(409, 'self_change', 'You cannot change your own Role');
      }
      if (role !== target.role && target.role === 'system_administrator'
        && target.status === 'active' && await this.activeAdminCount(client, scope.companyId) <= 1) {
        throw new ApiProblem(409, 'last_admin', 'The last administrator must keep the Role');
      }
      const previousFarm = await client.query<{ id: string; public_id: string }>(
        `SELECT f.id, f.public_id FROM user_farm_assignments a
         JOIN farms f ON f.id = a.farm_id
         WHERE a.user_id = $1 AND a.unassigned_at IS NULL`, [target.id],
      );
      const farmId = data.farmId === undefined ? previousFarm.rows[0]?.public_id : data.farmId;
      let newFarmUuid: string | null = null;
      if (role === 'technical_manager') {
        if (typeof farmId !== 'string' || !farmId.trim()) {
          throw invalid('farmId', 'A Technical Manager needs an assigned Farm');
        }
        const farm = await client.query<{ id: string }>(
          'SELECT id FROM farms WHERE company_id = $1 AND public_id = $2',
          [scope.companyId, farmId],
        );
        if (!farm.rows[0]) throw invalid('farmId', 'Farm does not belong to this Company');
        newFarmUuid = farm.rows[0].id;
      } else if (farmId !== null && farmId !== undefined && data.farmId !== undefined) {
        throw invalid('farmId', 'Only a Technical Manager can have an assigned Farm');
      }
      if (previousFarm.rows[0]?.id !== newFarmUuid) {
        await client.query(
          'UPDATE user_farm_assignments SET unassigned_at = now() WHERE user_id = $1 AND unassigned_at IS NULL',
          [target.id],
        );
        if (newFarmUuid) {
          await client.query(
            'INSERT INTO user_farm_assignments (user_id, farm_id, assigned_at) VALUES ($1, $2, now())',
            [target.id, newFarmUuid],
          );
        }
      }
      await client.query(
        `UPDATE users SET role = $2, language = $3, updated_at = now(),
          row_version = row_version + 1 WHERE id = $1`, [target.id, role, language],
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
    return this.get(scope, userId);
  }

  async deactivate(scope: UserScope, userId: string): Promise<AdminUser> {
    await this.changeStatus(scope, userId, 'deactivate');
    return this.get(scope, userId);
  }

  async reactivate(scope: UserScope, userId: string): Promise<AdminUser> {
    await this.changeStatus(scope, userId, 'reactivate');
    return this.get(scope, userId);
  }

  private async changeStatus(scope: UserScope, userId: string, action: 'deactivate' | 'reactivate'):
  Promise<void> {
    const client = await this.postgres.pool.connect();
    try {
      await client.query('BEGIN');
      await this.lockCompany(client, scope.companyId);
      const target = await this.lockUser(client, scope.companyId, userId);
      if (action === 'deactivate') {
        if (target.id === scope.actorId) {
          throw new ApiProblem(409, 'self_deactivate', 'You cannot deactivate yourself');
        }
        if (target.role === 'system_administrator' && target.status === 'active'
          && await this.activeAdminCount(client, scope.companyId) <= 1) {
          throw new ApiProblem(409, 'last_admin', 'The last administrator cannot be deactivated');
        }
        if (target.status === 'deactivated') {
          throw new ApiProblem(409, 'already_deactivated', 'User is already deactivated');
        }
        await client.query(
          `UPDATE users SET status = 'deactivated', updated_at = now(),
            row_version = row_version + 1 WHERE id = $1`, [target.id],
        );
        await client.query(
          'UPDATE auth_sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL',
          [target.id],
        );
      } else {
        await client.query(
          `UPDATE users SET status = CASE WHEN activated_at IS NULL THEN 'invited' ELSE 'active' END,
            updated_at = now(), row_version = row_version + 1 WHERE id = $1`, [target.id],
        );
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
  }

  private async rows(companyId: string): Promise<UserRow[]> {
    const result = await this.postgres.pool.query<UserRow>(
      `SELECT u.id, u.public_id, u.name, u.email, u.role, u.status, u.language,
        u.invited_at, u.activated_at, u.last_sign_in_at, u.failed_login_count,
        f.id AS farm_uuid, f.public_id AS farm_public_id, f.name AS farm_name,
        inviter.public_id AS inviter_public_id, inviter.name AS inviter_name,
        token.expires_at AS invitation_expires_at,
        (SELECT count(*) FROM users sa WHERE sa.company_id = u.company_id
         AND sa.role = 'system_administrator' AND sa.status = 'active') AS active_admin_count,
        (SELECT count(*) FROM user_farm_assignments ta JOIN users tm ON tm.id = ta.user_id
         WHERE ta.farm_id = f.id AND ta.unassigned_at IS NULL
           AND tm.role = 'technical_manager' AND tm.status = 'active') AS active_tm_count
       FROM users u
       LEFT JOIN user_farm_assignments a ON a.user_id = u.id AND a.unassigned_at IS NULL
       LEFT JOIN farms f ON f.id = a.farm_id
       LEFT JOIN users inviter ON inviter.id = u.invited_by_user_id
       LEFT JOIN LATERAL (
         SELECT expires_at FROM password_tokens pt WHERE pt.user_id = u.id
           AND pt.purpose = 'invite' AND pt.used_at IS NULL
         ORDER BY pt.created_at DESC LIMIT 1
       ) token ON true
       WHERE u.company_id = $1`, [companyId],
    );
    return result.rows;
  }

  private async lockCompany(client: PoolClient, companyId: string): Promise<void> {
    const found = await client.query('SELECT id FROM companies WHERE id = $1 FOR UPDATE', [companyId]);
    if (!found.rowCount) throw new ApiProblem(404, 'not_found', 'Company not found');
  }

  private async lockUser(client: PoolClient, companyId: string, userId: string): Promise<{
    id: string; role: Role; status: Status; language: Language;
  }> {
    const result = await client.query<{ id: string; role: Role; status: Status; language: Language }>(
      'SELECT id, role, status, language FROM users WHERE company_id = $1 AND public_id = $2 FOR UPDATE',
      [companyId, userId],
    );
    if (!result.rows[0]) throw new ApiProblem(404, 'not_found', 'User not found');
    return result.rows[0];
  }

  private async activeAdminCount(client: PoolClient, companyId: string): Promise<number> {
    const result = await client.query<{ count: string }>(
      `SELECT count(*) FROM users WHERE company_id = $1
       AND role = 'system_administrator' AND status = 'active'`, [companyId],
    );
    return Number(result.rows[0].count);
  }
}
