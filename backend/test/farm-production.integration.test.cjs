const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { test } = require('node:test');
const { createPostgresPool } = require('../dist/infrastructure/postgres');
const { FarmProductionService } = require('../dist/business/farm-production.service');

test('farm production weights survival and FCR by their source totals', async () => {
  const pool = createPostgresPool();
  const client = await pool.connect();
  const suffix = randomUUID().slice(0, 8);
  let pending = Promise.resolve();
  const postgres = { pool: { query: (...args) => {
    const result = pending.then(() => client.query(...args));
    pending = result.then(() => {}, () => {});
    return result;
  } } };
  const growth = { points: [{ doc: 0, targetAbwG: 5 },
    { doc: 30, targetAbwG: 22 }], onTrackBandPct: 5 };
  const principal = { companyId: '', userId: '', role: 'farms_manager' };
  let visible = [];
  const service = new FarmProductionService(postgres,
    { visibleFarmIds: async () => visible }, { getGrowth: async () => growth });
  try {
    await client.query('BEGIN');
    principal.companyId = (await client.query(`INSERT INTO companies
      (public_id,name,status) VALUES ($1,'Production Test','active') RETURNING id`,
    [`company-${suffix}`])).rows[0].id;
    const farmId = `farm-${suffix}`;
    const farm = (await client.query(`INSERT INTO farms
      (public_id,company_id,name,location,status)
      VALUES ($1,$2,'Farm','Java','active') RETURNING id`,
    [farmId, principal.companyId])).rows[0].id;
    visible = [farmId];
    principal.userId = (await client.query(`INSERT INTO users
      (public_id,company_id,name,email,password_hash,role,status)
      VALUES ($1,$2,'FM',$3,'test-hash','farms_manager','active') RETURNING id`,
    [`user-${suffix}`, principal.companyId, `${suffix}@example.invalid`])).rows[0].id;
    const rows = [];
    for (const [name, stocked, initial] of [['A', 10000, 10], ['B', 20000, 20]]) {
      const pond = (await client.query(`INSERT INTO ponds
        (public_id,farm_id,name,area_ha) VALUES ($1,$2,$3,1) RETURNING id`,
      [`pond-${name}-${suffix}`, farm, name])).rows[0].id;
      const cycle = (await client.query(`INSERT INTO production_cycles
        (pond_id,started_on,status) VALUES ($1,'2026-10-01','active') RETURNING id`,
      [pond])).rows[0].id;
      await client.query(`INSERT INTO stocking_records
        (public_id,cycle_id,pond_id,stocked_on,stocked_pl,initial_biomass_kg,recorded_by)
        VALUES ($1,$2,$3,'2026-10-01',$4,$5,$6)`,
      [`stock-${name}-${suffix}`, cycle, pond, stocked, initial, principal.userId]);
      rows.push({ name, pond, cycle });
    }
    const sample = (id, row, date, count, total) => client.query(`INSERT INTO sampling_records
      (public_id,pond_id,cycle_id,sample_date,sample_count,sample_weight_g,recorded_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [id, row.pond, row.cycle, date, count, total, principal.userId]);
    await sample(`old-${suffix}`, rows[0], '2026-10-05', 10, 50);
    await sample(`a-${suffix}`, rows[0], '2026-10-12', 10, 100);
    await sample(`b-${suffix}`, rows[1], '2026-10-12', 10, 200);
    for (const [index, count, kg] of [[0, 1000, 100], [1, 1000, 200]]) {
      await client.query(`INSERT INTO mortality_records
        (public_id,pond_id,record_date,count,weight_kg,recorded_by)
        VALUES ($1,$2,'2026-10-10',$3,1,$4)`,
      [`death-${index}-${suffix}`, rows[index].pond, count, principal.userId]);
      await client.query(`INSERT INTO feeding_records
        (public_id,pond_id,record_date,round_no,feed_type,amount_kg,recorded_by)
        VALUES ($1,$2,'2026-10-10',1,'Grower',$3,$4)`,
      [`feed-${index}-${suffix}`, rows[index].pond, kg, principal.userId]);
    }
    const result = await service.get(principal, farmId);
    assert.equal(result.samplingDate, '2026-10-12');
    assert.equal(result.kpis.biomassKg, 470);
    assert.equal(result.kpis.survivalRatePct, 28000 / 30000 * 100);
    assert.equal(result.kpis.fcr, 300 / 440);
    assert.deepEqual(result.kpis.growthDistribution,
      { behind: 1, onTrack: 0, ahead: 1 });
    assert.equal(result.ponds[0].adgGPerDay, 5 / 7);
    assert.equal(result.ponds[1].adgGPerDay, null);
    assert.equal(result.ponds[0].sizeUniformityPct, null);
    await assert.rejects(() => service.get(principal, 'unassigned-farm'),
      (error) => error.getStatus() === 404);
    await assert.rejects(() => service.get(principal, farmId, '2026-02-31'),
      (error) => error.getStatus() === 422);
    await client.query(`UPDATE stocking_records SET initial_biomass_kg=NULL
      WHERE cycle_id=$1`, [rows[0].cycle]);
    await assert.rejects(() => service.get(principal, farmId),
      (error) => error.getStatus() === 503);
  } finally {
    await client.query('ROLLBACK');
    client.release();
    await pool.end();
  }
});
