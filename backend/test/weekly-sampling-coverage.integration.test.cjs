const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { test } = require('node:test');
const { createPostgresPool } = require('../dist/infrastructure/postgres');
const { WeeklySamplingCoverageService } = require('../dist/business/weekly-sampling-coverage.service');

test('weekly coverage distinguishes measured ponds from complete laboratory results', async () => {
  const pool = createPostgresPool();
  const client = await pool.connect();
  const suffix = randomUUID().slice(0, 8);
  let pending = Promise.resolve();
  const service = new WeeklySamplingCoverageService({ pool: { query: (...args) => {
    const result = pending.then(() => client.query(...args));
    pending = result.then(() => {}, () => {});
    return result;
  } } });
  try {
    await client.query('BEGIN');
    const company = (await client.query(`INSERT INTO companies (public_id,name,status)
      VALUES ($1,'Weekly Sampling Test','active') RETURNING id`,
    [`company-${suffix}`])).rows[0].id;
    const farm = (await client.query(`INSERT INTO farms
      (public_id,company_id,name,location,status)
      VALUES ($1,$2,'Farm','Java','active') RETURNING id`,
    [`farm-${suffix}`, company])).rows[0].id;
    const otherFarm = (await client.query(`INSERT INTO farms
      (public_id,company_id,name,location,status)
      VALUES ($1,$2,'Other','Java','active') RETURNING id`,
    [`other-${suffix}`, company])).rows[0].id;
    const ponds = [];
    for (const [name, farmId] of [['A', farm], ['B', farm], ['C', farm], ['Other', otherFarm]]) {
      ponds.push((await client.query(`INSERT INTO ponds
        (public_id,farm_id,name,area_ha) VALUES ($1,$2,$3,1) RETURNING id`,
      [`pond-${name}-${suffix}`, farmId, name])).rows[0].id);
    }
    const user = (await client.query(`INSERT INTO users
      (public_id,company_id,name,email,password_hash,role,status)
      VALUES ($1,$2,'TM',$3,'test-hash','technical_manager','active') RETURNING id`,
    [`user-${suffix}`, company, `${suffix}@example.invalid`])).rows[0].id;
    const cycles = [];
    for (const pond of ponds) {
      cycles.push((await client.query(`INSERT INTO production_cycles
        (pond_id,started_on,status) VALUES ($1,'2026-10-01','active') RETURNING id`,
      [pond])).rows[0].id);
    }
    const sample = async (id, pond, cycle, date, count, weight, labs) =>
      client.query(`INSERT INTO sampling_records
        (public_id,pond_id,cycle_id,sample_date,sample_count,sample_weight_g,
         tan,no2,vibrio,alkalinity,recorded_by)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [id, pond, cycle, date, count, weight, ...labs, user]);
    await sample(`a-${suffix}`, ponds[0], cycles[0], '2026-10-12', 10, 120,
      [0.1, 0.2, 3, 120]);
    await sample(`b-${suffix}`, ponds[1], cycles[1], '2026-10-14', 10, 130,
      [null, null, null, null]);
    await sample(`b-lab-${suffix}`, ponds[1], cycles[1], '2026-10-15', null, null,
      [0.1, 0.2, 3, 120]);
    await sample(`other-${suffix}`, ponds[3], cycles[3], '2026-10-16', 10, 140,
      [0.1, 0.2, 3, 120]);
    assert.deepEqual(await service.snapshot(farm, '2026-10-12'), {
      date: '2026-10-14', sampled: 2, total: 3, labReceived: 2,
      notSampled: [{ id: `pond-C-${suffix}`, name: 'C' }],
    });
    assert.deepEqual(await service.snapshot(farm, '2026-10-05'), {
      date: null, sampled: 0, total: 3, labReceived: 0,
      notSampled: ['A', 'B', 'C'].map((name) =>
        ({ id: `pond-${name}-${suffix}`, name })),
    });
    await assert.rejects(() => service.snapshot(farm, '2026-10-13'),
      (error) => error.getStatus() === 422);
  } finally {
    await client.query('ROLLBACK');
    client.release();
    await pool.end();
  }
});
