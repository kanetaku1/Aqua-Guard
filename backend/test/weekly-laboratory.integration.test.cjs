const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { test } = require('node:test');
const { createPostgresPool } = require('../dist/infrastructure/postgres');
const { WeeklyLaboratoryService } = require('../dist/business/weekly-laboratory.service');

test('weekly laboratory keeps pending values and evaluates received results', async () => {
  const pool = createPostgresPool();
  const client = await pool.connect();
  const suffix = randomUUID().slice(0, 8);
  let pending = Promise.resolve();
  const postgres = { pool: { query: (...args) => {
    const result = pending.then(() => client.query(...args));
    pending = result.then(() => {}, () => {});
    return result;
  } } };
  const limits = {
    tan: [null, null, null, 1, 2, null],
    no2: [null, null, null, 0.5, 1, null],
    vibrio: [null, null, null, 5, 10, null],
    alkalinity: [null, 80, 100, 150, 180, null],
  };
  const thresholds = { effectiveThreshold: async (_company, _farm, parameter) => {
    const v = limits[parameter];
    return { parameter, criticalLow: v[0], warningLow: v[1],
      attentionLow: v[2], attentionHigh: v[3],
      warningHigh: v[4], criticalHigh: v[5] };
  } };
  const service = new WeeklyLaboratoryService(postgres, thresholds);
  try {
    await client.query('BEGIN');
    const company = (await client.query(`INSERT INTO companies (public_id,name,status)
      VALUES ($1,'Weekly Lab Test','active') RETURNING id`,
    [`company-${suffix}`])).rows[0].id;
    const farm = (await client.query(`INSERT INTO farms
      (public_id,company_id,name,location,status)
      VALUES ($1,$2,'Farm','Java','active') RETURNING id`,
    [`farm-${suffix}`, company])).rows[0].id;
    const user = (await client.query(`INSERT INTO users
      (public_id,company_id,name,email,password_hash,role,status)
      VALUES ($1,$2,'TM',$3,'test-hash','technical_manager','active') RETURNING id`,
    [`user-${suffix}`, company, `${suffix}@example.invalid`])).rows[0].id;
    const ponds = [];
    for (const name of ['A', 'B']) {
      const pond = (await client.query(`INSERT INTO ponds
        (public_id,farm_id,name,area_ha) VALUES ($1,$2,$3,1) RETURNING id`,
      [`pond-${name}-${suffix}`, farm, name])).rows[0].id;
      const cycle = (await client.query(`INSERT INTO production_cycles
        (pond_id,started_on,status) VALUES ($1,'2026-10-01','active') RETURNING id`,
      [pond])).rows[0].id;
      ponds.push({ pond, cycle });
    }
    await client.query(`INSERT INTO sampling_records
      (public_id,pond_id,cycle_id,sample_date,sample_count,sample_weight_g,
       tan,no2,vibrio,alkalinity,recorded_by)
      VALUES ($1,$2,$3,'2026-10-12',10,120,0.4,0.1,12,130,$4)`,
    [`a-${suffix}`, ponds[0].pond, ponds[0].cycle, user]);
    await client.query(`INSERT INTO sampling_records
      (public_id,pond_id,cycle_id,sample_date,sample_count,sample_weight_g,
       tan,no2,vibrio,alkalinity,recorded_by)
      VALUES ($1,$2,$3,'2026-10-13',10,130,0.4,NULL,NULL,NULL,$4)`,
    [`b-${suffix}`, ponds[1].pond, ponds[1].cycle, user]);
    const result = await service.snapshot(company, farm, '2026-10-12');
    assert.equal(result.length, 2);
    assert.equal(result[0].laboratory.pending, false);
    assert.equal(result[0].laboratory.vibrio, 12);
    assert.equal(result[0].laboratory.severity.vibrio, 'warning');
    assert.equal(result[1].laboratory.pending, true);
    assert.equal(result[1].laboratory.no2, null);
    assert.equal(result[1].laboratory.severity.no2, null);
  } finally {
    await client.query('ROLLBACK');
    client.release();
    await pool.end();
  }
});
