const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { test } = require('node:test');
const { createPostgresPool } = require('../dist/infrastructure/postgres');

async function expectConstraint(client, sql, values, code) {
  await client.query('SAVEPOINT rejected');
  try {
    await assert.rejects(client.query(sql, values), (error) => error.code === code);
  } finally {
    await client.query('ROLLBACK TO SAVEPOINT rejected');
    await client.query('RELEASE SAVEPOINT rejected');
  }
}

test('initial schema enforces frontend enums, ownership keys and non-overlapping assignments', async () => {
  const pool = createPostgresPool();
  const client = await pool.connect();
  const suffix = randomUUID();

  try {
    await client.query('BEGIN');
    const migration = await client.query(
      "SELECT filename FROM schema_migrations WHERE filename = '0001_foundation.sql'",
    );
    assert.equal(migration.rowCount, 1);

    const company = await client.query(
      "INSERT INTO companies (public_id, name, status) VALUES ($1, 'Test Company', 'active') RETURNING id",
      [`company-${suffix}`],
    );
    const farm = await client.query(
      "INSERT INTO farms (public_id, company_id, name, location) VALUES ($1, $2, 'Test Farm', 'East Java, Indonesia') RETURNING id",
      [`farm-${suffix}`, company.rows[0].id],
    );
    const pond = await client.query(
      "INSERT INTO ponds (public_id, farm_id, name, area_ha) VALUES ($1, $2, 'Pond 01', 0.25) RETURNING id",
      [`pond-${suffix}`, farm.rows[0].id],
    );
    await expectConstraint(
      client,
      "INSERT INTO ponds (public_id, farm_id, name, area_ha) VALUES ($1, $2, 'pond 01', 0.5)",
      [`pond-duplicate-${suffix}`, farm.rows[0].id],
      '23505',
    );

    await expectConstraint(
      client,
      "INSERT INTO users (public_id, company_id, name, email, role, status) VALUES ($1, $2, 'Test', $3, 'technical_manager', 'active')",
      [`user-missing-password-${suffix}`, company.rows[0].id, `missing-${suffix}@example.test`],
      '23514',
    );
    const user = await client.query(
      "INSERT INTO users (public_id, company_id, name, email, role, status, password_hash) VALUES ($1, $2, 'Test', $3, 'technical_manager', 'active', 'test-hash') RETURNING id",
      [`user-${suffix}`, company.rows[0].id, `User-${suffix}@example.test`],
    );
    await expectConstraint(
      client,
      "INSERT INTO users (public_id, company_id, name, email, role, status, password_hash) VALUES ($1, $2, 'Test 2', $3, 'technical_manager', 'active', 'test-hash')",
      [`user-duplicate-${suffix}`, company.rows[0].id, `user-${suffix}@example.test`],
      '23505',
    );

    await client.query(
      'INSERT INTO user_farm_assignments (user_id, farm_id, assigned_at) VALUES ($1, $2, $3)',
      [user.rows[0].id, farm.rows[0].id, '2026-10-01T00:00:00Z'],
    );
    await expectConstraint(
      client,
      'INSERT INTO user_farm_assignments (user_id, farm_id, assigned_at) VALUES ($1, $2, $3)',
      [user.rows[0].id, farm.rows[0].id, '2026-10-02T00:00:00Z'],
      '23505',
    );

    const device = await client.query(
      "INSERT INTO devices (device_id, type, parameter) VALUES ($1, 'sensor', 'do') RETURNING id",
      [`device-${suffix}`],
    );
    await client.query(
      'INSERT INTO device_assignments (device_id, pond_id, assigned_at, unassigned_at) VALUES ($1, $2, $3, $4)',
      [device.rows[0].id, pond.rows[0].id, '2026-10-01T00:00:00Z', '2026-10-03T00:00:00Z'],
    );
    await expectConstraint(
      client,
      'INSERT INTO device_assignments (device_id, pond_id, assigned_at) VALUES ($1, $2, $3)',
      [device.rows[0].id, pond.rows[0].id, '2026-10-02T00:00:00Z'],
      '23P01',
    );
    await client.query(
      'INSERT INTO device_assignments (device_id, pond_id, assigned_at) VALUES ($1, $2, $3)',
      [device.rows[0].id, pond.rows[0].id, '2026-10-03T00:00:00Z'],
    );

    await client.query(
      'INSERT INTO ingestion_receipts (device_id, event_id, payload_hash, received_at) VALUES ($1, $2, $3, now())',
      [device.rows[0].id, 'event-1', 'test-payload-hash'],
    );
    await expectConstraint(
      client,
      'INSERT INTO ingestion_receipts (device_id, event_id, payload_hash, received_at) VALUES ($1, $2, $3, now())',
      [device.rows[0].id, 'event-1', 'test-payload-hash'],
      '23505',
    );
  } finally {
    await client.query('ROLLBACK');
    client.release();
    await pool.end();
  }
});
