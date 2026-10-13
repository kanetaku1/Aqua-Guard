const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { test } = require('node:test');
const { createPostgresPool } = require('../dist/infrastructure/postgres');
const { bootstrapAdmin } = require('../dist/tools/bootstrap-admin');
const { verifyPassword } = require('../dist/auth/password');

test('bootstrap creates one administrator and rolls back test data', async (t) => {
  const pool = createPostgresPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const existing = await client.query(
      "SELECT 1 FROM users WHERE role = 'system_administrator' LIMIT 1",
    );
    if (existing.rowCount) {
      t.skip('Database already contains an administrator');
      return;
    }
    const suffix = randomUUID().slice(0, 8);
    const input = {
      companyId: `bootstrap-company-${suffix}`,
      companyName: 'Bootstrap Test Company',
      adminId: `bootstrap-admin-${suffix}`,
      adminName: 'Bootstrap Admin',
      adminEmail: `bootstrap-${suffix}@example.test`,
      adminPassword: 'SafePassword123',
    };
    await bootstrapAdmin(client, input);
    const result = await client.query(
      `SELECT u.role, u.status, u.password_hash, c.public_id AS company_id
       FROM users u JOIN companies c ON c.id = u.company_id WHERE u.public_id = $1`,
      [input.adminId],
    );
    assert.equal(result.rows[0].role, 'system_administrator');
    assert.equal(result.rows[0].status, 'active');
    assert.equal(result.rows[0].company_id, input.companyId);
    assert.equal(await verifyPassword(input.adminPassword, result.rows[0].password_hash), true);
    await assert.rejects(bootstrapAdmin(client, input), /administrator already exists/);
  } finally {
    await client.query('ROLLBACK');
    client.release();
    await pool.end();
  }
});
