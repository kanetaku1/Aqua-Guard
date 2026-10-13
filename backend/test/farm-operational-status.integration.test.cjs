const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { test } = require('node:test');
const { createPostgresPool } = require('../dist/infrastructure/postgres');
const { BusinessScopeService } = require('../dist/business/business-scope.service');
const { FarmOperationalStatusService } = require('../dist/business/farm-operational-status.service');

test('farm operational status uses stored generator, planned sampling and local-day feeding', async () => {
  const pool = createPostgresPool();
  const client = await pool.connect();
  const suffix = randomUUID().slice(0, 8);
  let pending = Promise.resolve();
  const postgres = { pool: { query: (...args) => {
    const result = pending.then(() => client.query(...args));
    pending = result.then(() => {}, () => {});
    return result;
  } } };
  const scope = new BusinessScopeService(postgres);
  const snapshot = {
    sensors: { online: 1, total: 1, offline: [], neverSeen: 0 },
    aerators: { on: 1, total: 1, unknown: 0 },
    pumps: { on: 0, total: 0, unknown: 0 },
    equipmentFaults: [], equipmentOffline: [], completeForFarmOperations: false,
  };
  const service = new FarmOperationalStatusService(postgres, scope,
    { snapshot: async () => snapshot });
  const now = new Date('2026-10-11T16:30:00Z'); // 12 October in Jayapura
  try {
    await client.query('BEGIN');
    const company = (await client.query(`INSERT INTO companies (public_id,name,status)
      VALUES ($1,'Operations Test','active') RETURNING id`, [`company-${suffix}`])).rows[0].id;
    const farm = (await client.query(`INSERT INTO farms
      (public_id,company_id,name,location,time_zone,status)
      VALUES ($1,$2,'Farm','Papua','Asia/Jayapura','active') RETURNING id`,
    [`farm-${suffix}`, company])).rows[0].id;
    const pond = (await client.query(`INSERT INTO ponds
      (public_id,farm_id,name,area_ha) VALUES ($1,$2,'Pond',1) RETURNING id`,
    [`pond-${suffix}`, farm])).rows[0].id;
    const user = (await client.query(`INSERT INTO users
      (public_id,company_id,name,email,password_hash,role,status)
      VALUES ($1,$2,'TM',$3,'test-hash','technical_manager','active') RETURNING id`,
    [`user-${suffix}`, company, `${suffix}@example.invalid`])).rows[0].id;
    await client.query(`INSERT INTO user_farm_assignments (user_id,farm_id,assigned_at)
      VALUES ($1,$2,$3)`, [user, farm, now]);
    const principal = { userId: user, companyId: company, role: 'technical_manager' };
    await assert.rejects(service.get(principal, `farm-${suffix}`, now),
      (error) => error.getStatus() === 503);
    await client.query(`INSERT INTO farm_generator_states
      (farm_id,state,observed_at,last_tested_at)
      VALUES ($1,'standby','2026-10-11T16:00:00Z','2026-10-11T15:00:00Z')`, [farm]);
    await client.query(`INSERT INTO farm_sampling_schedule (farm_id,scheduled_on)
      VALUES ($1,'2026-10-11'),($1,'2026-10-15')`, [farm]);
    await client.query(`INSERT INTO feeding_plan_rounds
      (pond_id,plan_date,round_no,scheduled_at,feed_type,amount_kg)
      VALUES ($1,'2026-10-12',1,'06:00','Grower',2),
             ($1,'2026-10-12',2,'18:00','Grower',3)`, [pond]);
    await client.query(`INSERT INTO feeding_records
      (public_id,pond_id,record_date,round_no,feed_type,amount_kg,recorded_by)
      VALUES ($1,$2,'2026-10-12',1,'Grower',2,$3)`,
    [`feed-${suffix}`, pond, user]);
    assert.deepEqual(await service.get(principal, `farm-${suffix}`, now), {
      aerators: { on: 1, total: 1 }, pumps: { on: 0, total: 0 },
      sensors: { online: 1, total: 1, offline: [] },
      feedingToday: { roundsDone: 1, roundsPlanned: 2, totalKg: 2 },
      nextSampling: '2026-10-15',
      generator: { state: 'standby', lastTestedAt: '2026-10-11T15:00:00.000Z' },
    });
    snapshot.sensors.neverSeen = 1;
    await assert.rejects(service.get(principal, `farm-${suffix}`, now),
      (error) => error.getStatus() === 503);
    snapshot.sensors.neverSeen = 0;
    snapshot.equipmentOffline.push('pump-1');
    await assert.rejects(service.get(principal, `farm-${suffix}`, now),
      (error) => error.getStatus() === 503);
    snapshot.equipmentOffline.length = 0;
    await assert.rejects(service.get(principal, 'missing-farm', now),
      (error) => error.getStatus() === 404);
    await assert.rejects(service.get({ ...principal, role: 'farms_manager' },
      `farm-${suffix}`, now), (error) => error.getStatus() === 403);
    await client.query('SAVEPOINT bad_generator');
    await assert.rejects(client.query(`UPDATE farm_generator_states
      SET state='healthy' WHERE farm_id=$1`, [farm]),
    (error) => error.code === '23514');
    await client.query('ROLLBACK TO SAVEPOINT bad_generator');
  } finally {
    await client.query('ROLLBACK');
    client.release();
    await pool.end();
  }
});
