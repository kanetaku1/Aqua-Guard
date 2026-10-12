const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { test } = require('node:test');
const { createPostgresPool } = require('../dist/infrastructure/postgres');
const { PondPlanningService } = require('../dist/business/pond-planning.service');

async function expectConstraint(client, sql, values, code) {
  await client.query('SAVEPOINT invalid_plan');
  try {
    await assert.rejects(client.query(sql, values), (error) => error.code === code);
  } finally {
    await client.query('ROLLBACK TO SAVEPOINT invalid_plan');
    await client.query('RELEASE SAVEPOINT invalid_plan');
  }
}

test('pond planning reads active stocking and dated feeding rounds without invented values', async () => {
  const pool = createPostgresPool();
  const client = await pool.connect();
  const suffix = randomUUID().slice(0, 8);
  const service = new PondPlanningService({ pool: {
    query: (...args) => client.query(...args),
  } });
  try {
    await client.query('BEGIN');
    const companyId = (await client.query(`INSERT INTO companies (public_id,name,status)
      VALUES ($1,'Planning Test','active') RETURNING id`, [`company-${suffix}`])).rows[0].id;
    const farmId = (await client.query(`INSERT INTO farms
      (public_id,company_id,name,location,status)
      VALUES ($1,$2,'Farm','Java','active') RETURNING id`,
    [`farm-${suffix}`, companyId])).rows[0].id;
    const pondId = (await client.query(`INSERT INTO ponds
      (public_id,farm_id,name,area_ha) VALUES ($1,$2,'Pond',1) RETURNING id`,
    [`pond-${suffix}`, farmId])).rows[0].id;
    const userId = (await client.query(`INSERT INTO users
      (public_id,company_id,name,email,password_hash,role,status)
      VALUES ($1,$2,'TM',$3,'test-hash','technical_manager','active') RETURNING id`,
    [`user-${suffix}`, companyId, `${suffix}@example.invalid`])).rows[0].id;
    assert.deepEqual(await service.snapshot(pondId, '2026-10-12'), {
      stockedOn: null, stockedPl: null, doc: null,
      feeding: { schedule: [], feedTypes: [], planToday: [] },
    });
    const cycleId = (await client.query(`INSERT INTO production_cycles
      (pond_id,started_on,status) VALUES ($1,'2026-10-01','active') RETURNING id`,
    [pondId])).rows[0].id;
    await expectConstraint(client, `INSERT INTO stocking_records
      (public_id,cycle_id,pond_id,stocked_on,stocked_pl,recorded_by)
      VALUES ($1,$2,$3,'2026-10-01',0,$4)`,
    [`stock-invalid-${suffix}`, cycleId, pondId, userId], '23514');
    await expectConstraint(client, `INSERT INTO stocking_records
      (public_id,cycle_id,pond_id,stocked_on,stocked_pl,recorded_by)
      VALUES ($1,$2,$3,'2026-10-02',10000,$4)`,
    [`stock-date-${suffix}`, cycleId, pondId, userId], '23503');
    await client.query(`INSERT INTO stocking_records
      (public_id,cycle_id,pond_id,stocked_on,stocked_pl,recorded_by)
      VALUES ($1,$2,$3,'2026-10-01',10000,$4)`,
    [`stock-${suffix}`, cycleId, pondId, userId]);
    await client.query(`INSERT INTO feeding_plan_rounds
      (pond_id,plan_date,round_no,scheduled_at,feed_type,amount_kg,note)
      VALUES ($1,'2026-10-12',1,'06:00','Grower',12,NULL),
             ($1,'2026-10-12',2,'12:00','Grower',10,'reduced')`, [pondId]);
    await expectConstraint(client, `INSERT INTO feeding_plan_rounds
      (pond_id,plan_date,round_no,scheduled_at,feed_type,amount_kg)
      VALUES ($1,'2026-10-12',2,'18:00','Grower',10)`, [pondId], '23505');
    assert.deepEqual(await service.snapshot(pondId, '2026-10-12'), {
      stockedOn: '2026-10-01', stockedPl: 10000, doc: 11,
      feeding: { schedule: ['06:00', '12:00'], feedTypes: ['Grower'],
        planToday: [{ round: 1, amountKg: 12, note: null },
          { round: 2, amountKg: 10, note: 'reduced' }] },
    });
    assert.deepEqual((await service.snapshot(pondId, '2026-09-30')).stockedOn, null);
    assert.deepEqual((await service.snapshot(pondId, '2026-10-11')).feeding.schedule, []);
    await assert.rejects(service.snapshot(pondId, '2026-02-30'));
  } finally {
    await client.query('ROLLBACK');
    client.release();
    await pool.end();
  }
});
