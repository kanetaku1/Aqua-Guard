import { Injectable, Logger } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { PostgresService } from '../infrastructure/postgres.service';
import { ApiProblem } from '../http/problem';
import { AuthService, Me } from './auth.service';
import { MailService, PasswordPurpose } from './mail.service';
import { hashPassword, validNewPassword } from './password';
import { hashToken, newToken } from './token';

interface TokenRow {
  id: string;
  user_id: string;
  purpose: PasswordPurpose;
  expires_at: Date;
  used_at: Date | null;
  name: string;
  email: string;
  role: 'farms_manager' | 'technical_manager' | 'system_administrator';
  status: 'invited' | 'active' | 'deactivated';
  farm_public_id: string | null;
  farm_name: string | null;
}

export interface PasswordTokenInfo {
  mode: PasswordPurpose;
  name: string;
  email: string;
  role: TokenRow['role'];
  farm: { id: string; name: string } | null;
  expiresAt: string;
}

@Injectable()
export class PasswordLinksService {
  private readonly logger = new Logger(PasswordLinksService.name);

  constructor(
    private readonly postgres: PostgresService,
    private readonly auth: AuthService,
    private readonly mail: MailService,
  ) {}

  async issue(client: PoolClient, userId: string, purpose: PasswordPurpose): Promise<string> {
    const token = newToken();
    await client.query(
      `UPDATE password_tokens SET used_at = now()
       WHERE user_id = $1 AND purpose = $2 AND used_at IS NULL`,
      [userId, purpose],
    );
    const lifetime = purpose === 'invite' ? '72 hours' : '1 hour';
    await client.query(
      `INSERT INTO password_tokens (user_id, token_hash, purpose, expires_at)
       VALUES ($1, $2, $3, now() + $4::interval)`,
      [userId, hashToken(token), purpose, lifetime],
    );
    return token;
  }

  async deliver(email: string, purpose: PasswordPurpose, token: string): Promise<void> {
    await this.mail.sendPasswordLink(email, purpose, token);
  }

  async requestReset(email: string): Promise<void> {
    const emailKey = email.trim().toLowerCase();
    const client = await this.postgres.pool.connect();
    let delivery: { email: string; token: string } | null = null;
    try {
      await client.query('BEGIN');
      const result = await client.query<{ id: string; email: string }>(
        `SELECT id, email FROM users WHERE lower(email) = $1 AND status = 'active' FOR UPDATE`,
        [emailKey],
      );
      if (result.rows[0]) {
        const token = await this.issue(client, result.rows[0].id, 'reset');
        delivery = { email: result.rows[0].email, token };
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
    if (delivery) {
      try {
        await this.deliver(delivery.email, 'reset', delivery.token);
      } catch {
        // The public response must not reveal whether an account exists.
        this.logger.error('Password reset mail delivery failed');
      }
    }
  }

  async getToken(token: string): Promise<PasswordTokenInfo> {
    const row = await this.lookup(token);
    return {
      mode: row.purpose, name: row.name, email: row.email, role: row.role,
      farm: row.farm_public_id && row.farm_name
        ? { id: row.farm_public_id, name: row.farm_name } : null,
      expiresAt: row.expires_at.toISOString(),
    };
  }

  async setPassword(token: string, password: unknown): Promise<{
    me: Me; sessionToken: string | null;
  }> {
    if (!validNewPassword(password)) {
      throw new ApiProblem(422, 'validation_error', 'Invalid password', {
        fieldErrors: [{ field: 'password', message: 'At least 10 characters with a letter and a digit' }],
      });
    }
    if (!/^[0-9a-f]{64}$/.test(token)) throw this.expired();
    const client = await this.postgres.pool.connect();
    let userId: string;
    let sessionToken: string | null = null;
    try {
      await client.query('BEGIN');
      const identity = await client.query<{ user_id: string }>(
        'SELECT user_id FROM password_tokens WHERE token_hash = $1', [hashToken(token)],
      );
      if (!identity.rows[0]) throw this.expired();
      const owner = await client.query<{ status: TokenRow['status'] }>(
        'SELECT status FROM users WHERE id = $1 FOR UPDATE', [identity.rows[0].user_id],
      );
      const result = await client.query<{
        id: string; user_id: string; purpose: PasswordPurpose;
      }>(
        `SELECT id, user_id, purpose FROM password_tokens
         WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()
         FOR UPDATE`, [hashToken(token)],
      );
      const row = result.rows[0];
      if (!row || !owner.rows[0] || (row.purpose === 'invite' && owner.rows[0].status !== 'invited')
        || (row.purpose === 'reset' && owner.rows[0].status !== 'active')) throw this.expired();
      await client.query(
        `UPDATE users SET password_hash = $2, status = 'active',
          activated_at = coalesce(activated_at, now()), failed_login_count = 0,
          locked_until = NULL, updated_at = now(), row_version = row_version + 1
         WHERE id = $1`, [row.user_id, await hashPassword(password)],
      );
      await client.query(
        'UPDATE password_tokens SET used_at = now() WHERE id = $1', [row.id],
      );
      await client.query(
        `UPDATE password_tokens SET used_at = now()
         WHERE user_id = $1 AND used_at IS NULL`, [row.user_id],
      );
      if (row.purpose === 'reset') {
        await client.query(
          'UPDATE auth_sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL',
          [row.user_id],
        );
      } else {
        sessionToken = await this.auth.createSession(client, row.user_id);
      }
      userId = row.user_id;
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
    return { me: await this.auth.getMe(userId), sessionToken };
  }

  private async lookup(token: string): Promise<TokenRow> {
    if (!/^[0-9a-f]{64}$/.test(token)) throw this.expired();
    const result = await this.postgres.pool.query<TokenRow>(
      `SELECT pt.id, pt.user_id, pt.purpose, pt.expires_at, pt.used_at,
        u.name, u.email, u.role, u.status,
        f.public_id AS farm_public_id, f.name AS farm_name
       FROM password_tokens pt JOIN users u ON u.id = pt.user_id
       LEFT JOIN user_farm_assignments a ON a.user_id = u.id AND a.unassigned_at IS NULL
       LEFT JOIN farms f ON f.id = a.farm_id
       WHERE pt.token_hash = $1 AND pt.used_at IS NULL AND pt.expires_at > now()`,
      [hashToken(token)],
    );
    const row = result.rows[0];
    if (!row || (row.purpose === 'invite' && row.status !== 'invited')
      || (row.purpose === 'reset' && row.status !== 'active')) throw this.expired();
    return row;
  }

  private expired(): ApiProblem {
    return new ApiProblem(410, 'token_expired', 'Link expired');
  }
}
