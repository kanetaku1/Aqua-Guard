import { createHash, randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { PostgresService } from '../infrastructure/postgres.service';
import { ApiProblem } from '../http/problem';
import { hashPassword, verifyPassword } from './password';

const SESSION_HOURS = 12;
const DUMMY_HASH = hashPassword('dummy-password-123');

type Role = 'farms_manager' | 'technical_manager' | 'system_administrator';
type Language = 'en' | 'id';

interface UserRow {
  id: string;
  public_id: string;
  company_id: string;
  name: string;
  email: string;
  role: Role;
  status: 'invited' | 'active' | 'deactivated';
  language: Language;
  password_hash: string | null;
  failed_login_count: number;
  locked_until: Date | null;
}

export interface Principal {
  userId: string;
  sessionId: string;
  companyId: string;
  role: Role;
}

export interface Me {
  id: string;
  name: string;
  initials: string;
  email: string;
  role: Role;
  language: Language;
  company: string;
  scopeLabel: string;
  farm: { id: string; name: string } | null;
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function initials(name: string): string {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? '').join('');
}

@Injectable()
export class AuthService {
  constructor(private readonly postgres: PostgresService) {}

  async login(email: string, password: string, language?: Language): Promise<{ token: string; me: Me }> {
    const emailKey = email.trim().toLowerCase();
    const client = await this.postgres.pool.connect();
    let userId: string;
    let token: string;
    try {
      await client.query('BEGIN');
      const result = await client.query<UserRow>(
        'SELECT * FROM users WHERE lower(email) = $1 FOR UPDATE', [emailKey],
      );
      const user = result.rows[0];
      if (user?.status === 'deactivated') {
        throw new ApiProblem(403, 'account_deactivated', 'Account deactivated');
      }
      if (user?.locked_until && user.locked_until > new Date()) {
        await client.query(
          'INSERT INTO auth_attempts (email_key, result) VALUES ($1, $2)', [emailKey, 'locked'],
        );
        await client.query('COMMIT');
        throw new ApiProblem(423, 'account_locked', 'Account locked', {
          lockedUntil: user.locked_until.toISOString(),
        });
      }
      const valid = await verifyPassword(password, user?.password_hash ?? await DUMMY_HASH);
      if (!user || user.status !== 'active' || !valid) {
        let remainingAttempts = 4;
        let lockedUntil: Date | null = null;
        if (user?.status === 'active') {
          const failures = (user.locked_until ? 0 : user.failed_login_count) + 1;
          remainingAttempts = Math.max(0, 5 - failures);
          if (failures >= 5) lockedUntil = new Date(Date.now() + 15 * 60_000);
          await client.query(
            `UPDATE users SET failed_login_count = $2, locked_until = $3,
              updated_at = now() WHERE id = $1`, [user.id, failures, lockedUntil],
          );
        }
        await client.query(
          'INSERT INTO auth_attempts (email_key, result) VALUES ($1, $2)',
          [emailKey, lockedUntil ? 'locked' : 'failed'],
        );
        await client.query('COMMIT');
        if (lockedUntil) throw new ApiProblem(423, 'account_locked', 'Account locked', {
          lockedUntil: lockedUntil.toISOString(),
        });
        throw new ApiProblem(401, 'invalid_credentials', 'Invalid credentials', { remainingAttempts });
      }
      await client.query(
        `UPDATE users SET failed_login_count = 0, locked_until = NULL,
          last_sign_in_at = now(), updated_at = now() WHERE id = $1`, [user.id],
      );
      await client.query(
        'INSERT INTO auth_attempts (email_key, result) VALUES ($1, $2)', [emailKey, 'succeeded'],
      );
      token = await this.createSession(client, user.id);
      userId = user.id;
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    return { token, me: await this.getMe(userId, language) };
  }

  async authenticate(token: string): Promise<Principal | null> {
    if (!/^[0-9a-f]{64}$/.test(token)) return null;
    const result = await this.postgres.pool.query<{
      session_id: string; user_id: string; company_id: string; role: Role;
    }>(
      `UPDATE auth_sessions AS s SET last_activity_at = now(),
        expires_at = now() + interval '12 hours'
       FROM users AS u
       WHERE s.token_hash = $1 AND s.user_id = u.id
         AND s.revoked_at IS NULL AND s.expires_at > now() AND u.status = 'active'
       RETURNING s.id AS session_id, u.id AS user_id, u.company_id, u.role`,
      [hashToken(token)],
    );
    const row = result.rows[0];
    return row ? {
      userId: row.user_id, sessionId: row.session_id,
      companyId: row.company_id, role: row.role,
    } : null;
  }

  async logout(sessionId: string): Promise<void> {
    await this.postgres.pool.query(
      'UPDATE auth_sessions SET revoked_at = now() WHERE id = $1 AND revoked_at IS NULL',
      [sessionId],
    );
  }

  async updateLanguage(userId: string, language: Language): Promise<void> {
    await this.postgres.pool.query(
      'UPDATE users SET language = $2, updated_at = now() WHERE id = $1 AND status = $3',
      [userId, language, 'active'],
    );
  }

  async getMe(userId: string, preferredLanguage?: Language): Promise<Me> {
    const result = await this.postgres.pool.query<{
      public_id: string; name: string; email: string; role: Role; language: Language;
      company_name: string; company_id: string;
    }>(
      `SELECT u.public_id, u.name, u.email, u.role, u.language,
        c.name AS company_name, c.id AS company_id
       FROM users u JOIN companies c ON c.id = u.company_id
       WHERE u.id = $1 AND u.status = 'active'`, [userId],
    );
    const user = result.rows[0];
    if (!user) throw new ApiProblem(401, 'unauthorized', 'Unauthorized');
    const language = preferredLanguage ?? user.language;
    let farm: Me['farm'] = null;
    let scopeLabel: string;
    if (user.role === 'technical_manager') {
      const assignment = await this.postgres.pool.query<{
        public_id: string; name: string; location: string;
      }>(
        `SELECT f.public_id, f.name, f.location FROM user_farm_assignments a
         JOIN farms f ON f.id = a.farm_id
         WHERE a.user_id = $1 AND a.unassigned_at IS NULL AND f.company_id = $2`,
        [userId, user.company_id],
      );
      const assigned = assignment.rows[0];
      if (!assigned) throw new ApiProblem(403, 'farm_assignment_required', 'Farm assignment required');
      farm = { id: assigned.public_id, name: assigned.name };
      scopeLabel = `${assigned.name} · ${assigned.location}`;
    } else if (user.role === 'farms_manager') {
      const count = await this.postgres.pool.query<{ count: string }>(
        'SELECT count(*) FROM farms WHERE company_id = $1', [user.company_id],
      );
      const total = Number(count.rows[0].count);
      scopeLabel = language === 'id' ? `Semua Farm (${total})` : `All Farms (${total})`;
    } else {
      scopeLabel = language === 'id' ? 'Administrasi Sistem' : 'System Administration';
    }
    return {
      id: user.public_id, name: user.name, initials: initials(user.name),
      email: user.email, role: user.role, language: user.language,
      company: user.company_name, scopeLabel, farm,
    };
  }

  private async createSession(client: PoolClient, userId: string): Promise<string> {
    const token = randomBytes(32).toString('hex');
    await client.query(
      `INSERT INTO auth_sessions (user_id, token_hash, expires_at)
       VALUES ($1, $2, now() + interval '${SESSION_HOURS} hours')`,
      [userId, hashToken(token)],
    );
    return token;
  }
}
