const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { test } = require('node:test');
const { createPostgresPool } = require('../dist/infrastructure/postgres');
const { WeeklyReportTotalsService } = require('../dist/business/weekly-report-totals.service');

test('weekly totals keep Pond rows, prior-week comparison and missing stocking distinct', async () => {
  const pool = createPostgresPool();
  const client = await pool.connect();
  const suffix = randomUUID().slice(0, 8);
  let pending = Promise.resolve();
  const service = new WeeklyReportTotalsService({ pool: { query: (...args) => {
    const result = pending.then(() => client.query(...args));
    pending = result.then(() => {}, () => {});
    return result;
  } } });
  try {
    await client.query('BEGIN');
    const company = (await client.query(`INSERT INTO companies (public_id,name,status)
      VALUES ($1,'Weekly Totals Test','active') RETURNING id`,
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
    for (const [name, farmId] of [['A', farm], ['B', farm], ['Other', otherFarm]]) {
      ponds.push((await client.query(`INSERT INTO ponds
        (public_id,farm_id,name,area_ha) VALUES ($1,$2,$3,1) RETURNING id`,
      [`pond-${name}-${suffix}`, farmId, name])).rows[0].id);
    }
    const user = (await client.query(`INSERT INTO users
      (public_id,company_id,name,email,password_hash,role,status)
      VALUES ($1,$2,'TM',$3,'test-hash','technical_manager','active') RETURNING id`,
    [`user-${suffix}`, company, `${suffix}@example.invalid`])).rows[0].id;
    const feed = async (id, pond, date, round, kg) => client.query(`INSERT INTO feeding_records
      (public_id,pond_id,record_date,round_no,feed_type,amount_kg,recorded_by)
      VALUES ($1,$2,$3,$4,'Grower',$5,$6)`,
    [id, pond, date, round, kg, user]);
    await feed(`feed-prev-${suffix}`, ponds[0], '2026-10-06', 1, 10);
    await feed(`feed-a1-${suffix}`, ponds[0], '2026-10-13', 1, 6);
    await feed(`feed-a2-${suffix}`, ponds[0], '2026-10-13', 2, 4);
    await feed(`feed-b-${suffix}`, ponds[1], '2026-10-14', 1, 3);
    await feed(`feed-b2-${suffix}`, ponds[1], '2026-10-14', 2, 0.1);
    await feed(`feed-b3-${suffix}`, ponds[1], '2026-10-14', 3, 0.2);
    await feed(`feed-other-${suffix}`, ponds[2], '2026-10-13', 1, 500);
    const death = async (id, pond, date, count, kg) => client.query(`INSERT INTO mortality_records
      (public_id,pond_id,record_date,count,weight_kg,recorded_by)
      VALUES ($1,$2,$3,$4,$5,$6)`, [id, pond, date, count, kg, user]);
    await death(`death-prev-${suffix}`, ponds[0], '2026-10-06', 2, 0.02);
    await death(`death-a1-${suffix}`, ponds[0], '2026-10-13', 3, 0.03);
    await death(`death-a2-${suffix}`, ponds[0], '2026-10-13', 2, 0.02);
    await death(`death-a3-${suffix}`, ponds[0], '2026-10-14', 4, 0.04);
    await death(`death-b-${suffix}`, ponds[1], '2026-10-15', 1, 0.01);
    await death(`death-other-${suffix}`, ponds[2], '2026-10-13', 100, 1);
    const report = (await client.query(`INSERT INTO reports
      (public_id,farm_id,type,report_date,technical_manager_id,due_at)
      VALUES ($1,$2,'daily','2026-10-13',$3,'2026-10-13T11:00:00Z') RETURNING id`,
    [`daily-${suffix}`, farm, user])).rows[0].id;
    await client.query(`INSERT INTO daily_report_pond_inputs
      (report_id,pond_id,appetite) VALUES ($1,$2,'reduced'),($1,$3,'good')`,
    [report, ponds[0], ponds[1]]);
    const initial = await service.snapshot(farm, '2026-10-12');
    assert.equal(initial.feeding.total, 13.3);
    assert.equal(initial.feeding.byPond[1].value, 3.3);
    assert.equal(initial.feeding.previousTotal, 10);
    assert.deepEqual(initial.feeding.byPond.map((row) => row.changePct), [0, null]);
    assert.equal(initial.feeding.reducedAppetitePonds, 1);
    assert.deepEqual(initial.feeding.byPond.map((row) => row.reducedAppetiteDays), [1, 0]);
    assert.equal(initial.mortality.total, 10);
    assert.equal(initial.mortality.previousTotal, 2);
    assert.equal(initial.mortality.totalKg, 0.1);
    assert.equal(initial.mortality.per10kStocked, null);
    assert.equal(initial.mortality.byPond[0].peakDate, '2026-10-13');
    assert.equal(initial.mortality.byPond[0].peakValue, 5);
    const cycle = (await client.query(`INSERT INTO production_cycles
      (pond_id,started_on,status) VALUES ($1,'2026-10-01','active') RETURNING id`,
    [ponds[0]])).rows[0].id;
    await client.query(`INSERT INTO stocking_records
      (public_id,cycle_id,pond_id,stocked_on,stocked_pl,recorded_by)
      VALUES ($1,$2,$3,'2026-10-01',10000,$4)`,
    [`stock-${suffix}`, cycle, ponds[0], user]);
    const partial = await service.snapshot(farm, '2026-10-12');
    assert.equal(partial.mortality.per10kStocked, null);
    assert.equal(partial.mortality.byPond[0].per10kStocked, 9);
    assert.equal(partial.mortality.byPond[1].per10kStocked, null);
    const secondCycle = (await client.query(`INSERT INTO production_cycles
      (pond_id,started_on,status) VALUES ($1,'2026-10-01','active') RETURNING id`,
    [ponds[1]])).rows[0].id;
    await client.query(`INSERT INTO stocking_records
      (public_id,cycle_id,pond_id,stocked_on,stocked_pl,recorded_by)
      VALUES ($1,$2,$3,'2026-10-01',10000,$4)`,
    [`stock-b-${suffix}`, secondCycle, ponds[1], user]);
    assert.equal((await service.snapshot(farm, '2026-10-12'))
      .mortality.per10kStocked, 5);
    const noPrevious = await service.snapshot(farm, '2026-10-05');
    assert.equal(noPrevious.feeding.previousTotal, null);
    assert.equal(noPrevious.mortality.previousTotal, null);
    assert.deepEqual(noPrevious.feeding.byPond.map((row) => row.changePct), [null, null]);
    assert.deepEqual(noPrevious.mortality.byPond.map((row) => row.changePct), [null, null]);
    await assert.rejects(() => service.snapshot(farm, '2026-10-13'),
      (error) => error.getStatus() === 422);
  } finally {
    await client.query('ROLLBACK');
    client.release();
    await pool.end();
  }
});
