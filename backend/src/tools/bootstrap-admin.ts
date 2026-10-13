import type { PoolClient } from 'pg';
import { createPostgresPool } from '../infrastructure/postgres';
import { hashPassword, validNewPassword } from '../auth/password';

export interface BootstrapAdminInput {
  companyId: string;
  companyName: string;
  adminId: string;
  adminName: string;
  adminEmail: string;
  adminPassword: string;
}

export async function bootstrapAdmin(client: PoolClient, input: BootstrapAdminInput): Promise<void> {
  await client.query('SELECT pg_advisory_xact_lock(5135274735168024)');
  const existing = await client.query(
    "SELECT 1 FROM users WHERE role = 'system_administrator' LIMIT 1",
  );
  if (existing.rowCount) throw new Error('An administrator already exists');
  const values = [input.companyId, input.companyName, input.adminId,
    input.adminName, input.adminEmail, input.adminPassword];
  if (values.some((value) => !value || !value.trim())) {
    throw new Error('All BOOTSTRAP_* values are required');
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.adminEmail)) {
    throw new Error('BOOTSTRAP_ADMIN_EMAIL must be a valid email address');
  }
  if (!validNewPassword(input.adminPassword)) {
    throw new Error('BOOTSTRAP_ADMIN_PASSWORD needs 10 characters, a letter and a digit');
  }
  const company = await client.query<{ id: string }>(
    `INSERT INTO companies (public_id, name, status)
     VALUES ($1, $2, 'active') RETURNING id`,
    [input.companyId.trim(), input.companyName.trim()],
  );
  await client.query(
    `INSERT INTO users (public_id, company_id, name, email, password_hash, role, status, activated_at)
     VALUES ($1, $2, $3, $4, $5, 'system_administrator', 'active', now())`,
    [input.adminId.trim(), company.rows[0].id, input.adminName.trim(),
      input.adminEmail.trim().toLowerCase(), await hashPassword(input.adminPassword)],
  );
}

async function main(): Promise<void> {
  const pool = createPostgresPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await bootstrapAdmin(client, {
      companyId: process.env.BOOTSTRAP_COMPANY_ID ?? '',
      companyName: process.env.BOOTSTRAP_COMPANY_NAME ?? '',
      adminId: process.env.BOOTSTRAP_ADMIN_ID ?? '',
      adminName: process.env.BOOTSTRAP_ADMIN_NAME ?? '',
      adminEmail: process.env.BOOTSTRAP_ADMIN_EMAIL ?? '',
      adminPassword: process.env.BOOTSTRAP_ADMIN_PASSWORD ?? '',
    });
    await client.query('COMMIT');
    console.log('Initial company and administrator created');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

if (require.main === module) {
  void main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
