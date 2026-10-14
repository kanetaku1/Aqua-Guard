const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { test } = require('node:test');
const { createPostgresPool } = require('../dist/infrastructure/postgres');
const { registerStocking } = require('../dist/tools/register-stocking');

test('register-stocking starts one active cycle per Pond and rolls back test data', async () => {
  const pool = createPostgresPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const suffix = randomUUID().slice(0, 8);
    const company = (await client.query(
      `INSERT INTO companies (public_id, name, status) VALUES ($1, 'Stocking Test', 'active')
       RETURNING id`, [`stock-company-${suffix}`],
    )).rows[0].id;
    const farm = (await client.query(
      `INSERT INTO farms (public_id, company_id, name, location, status)
       VALUES ($1, $2, $3, 'Test', 'active') RETURNING id`,
      [`stock-farm-${suffix}`, company, `Stock Farm ${suffix}`],
    )).rows[0].id;
    for (const [name, status] of [['Pond01', 'in_operation'], ['Pond04', 'fallow']]) {
      await client.query(
        `INSERT INTO ponds (public_id, farm_id, name, area_ha, status)
         VALUES ($1, $2, $3, 1, $4)`, [`stock-${name}-${suffix}`, farm, name, status],
      );
    }
    const tm = (await client.query(
      `INSERT INTO users (public_id, company_id, name, email, password_hash, role, status)
       VALUES ($1, $2, 'TM', $3, 'x', 'technical_manager', 'active') RETURNING id`,
      [`stock-tm-${suffix}`, company, `stock-tm-${suffix}@example.test`],
    )).rows[0].id;
    await client.query(
      `INSERT INTO user_farm_assignments (user_id, farm_id, assigned_at)
       VALUES ($1, $2, now() - interval '1 day')`, [tm, farm],
    );
    const today = '2026-10-14';
    const base = { pond: 'Pond01', farm: `stock-farm-${suffix}`, stockedOn: '2026-09-14',
      stockedPl: 100000 };

    await assert.rejects(registerStocking(client, { ...base, stockedOn: '2026-10-15' }, today),
      /future/);
    await assert.rejects(registerStocking(client, { ...base, stockedPl: 0 }, today), /--pl/);
    await assert.rejects(registerStocking(client, { ...base, pond: 'Pond04' }, today), /fallow/);
    await assert.rejects(registerStocking(client, { ...base, pond: 'Pond09' }, today), /not found/);

    const saved = await registerStocking(client, { ...base, initialBiomassKg: 12.5 }, today);
    assert.equal(saved.pondId, `stock-Pond01-${suffix}`);
    assert.equal(saved.recordedBy, `stock-tm-${suffix}@example.test`);
    const rows = await client.query(
      `SELECT c.status, to_char(c.started_on, 'YYYY-MM-DD') AS started_on,
         s.stocked_pl, s.initial_biomass_kg::float AS biomass, s.recorded_by
       FROM production_cycles c JOIN stocking_records s ON s.cycle_id = c.id
       WHERE c.id = $1`, [saved.cycleId],
    );
    assert.deepEqual(rows.rows[0], { status: 'active', started_on: '2026-09-14',
      stocked_pl: 100000, biomass: 12.5, recorded_by: tm });
    await assert.rejects(registerStocking(client, base, today), /already has an active cycle/);
  } finally {
    await client.query('ROLLBACK');
    client.release();
    await pool.end();
  }
});
