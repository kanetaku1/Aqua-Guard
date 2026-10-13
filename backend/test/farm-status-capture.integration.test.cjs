const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { test } = require('node:test');
const { createPostgresPool } = require('../dist/infrastructure/postgres');
const { FarmStatusService } = require('../dist/business/farm-status.service');

test('background Farm status capture selects an active scoped actor', async () => {
  const pool = createPostgresPool();
  const client = await pool.connect();
  const suffix = randomUUID().slice(0, 8);
  try {
    await client.query('BEGIN');
    const company = (await client.query(`INSERT INTO companies (public_id,name,status)
      VALUES ($1,'Capture Test','active') RETURNING id`,
    [`company-${suffix}`])).rows[0].id;
    const farm = (await client.query(`INSERT INTO farms
      (public_id,company_id,name,location,status)
      VALUES ($1,$2,'Farm','Java','active') RETURNING id`,
    [`farm-${suffix}`, company])).rows[0].id;
    const fm = (await client.query(`INSERT INTO users
      (public_id,company_id,name,email,password_hash,role,status)
      VALUES ($1,$2,'FM',$3,'hash','farms_manager','active') RETURNING id`,
    [`fm-${suffix}`, company, `${suffix}@example.invalid`])).rows[0].id;
    const seen = [];
    const service = new FarmStatusService({ pool: {
      query: (...args) => client.query(...args),
    } }, {}, {}, {}, {}, {});
    service.summarize = async (principal, row) => {
      if (row.id === farm) seen.push({ principal, row });
    };
    const result = await service.captureAll(new Date('2026-10-12T06:00:00Z'));
    assert.ok(result.captured >= 1);
    assert.equal(seen.length, 1);
    assert.equal(seen[0].principal.userId, fm);
    assert.equal(seen[0].principal.role, 'farms_manager');
    assert.equal(seen[0].row.public_id, `farm-${suffix}`);
  } finally {
    await client.query('ROLLBACK');
    client.release();
    await pool.end();
  }
});
