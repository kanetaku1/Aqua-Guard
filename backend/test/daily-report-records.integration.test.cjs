const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { test } = require('node:test');
const { createPostgresPool } = require('../dist/infrastructure/postgres');
const { DailyReportRecordsService } = require('../dist/business/daily-report-records.service');
const { DailyReportPondsService } = require('../dist/business/daily-report-ponds.service');

test('daily report record source sums independent records once and isolates the date', async () => {
  const pool = createPostgresPool();
  const client = await pool.connect();
  const suffix = randomUUID().slice(0, 8);
  let pending = Promise.resolve();
  const postgres = { pool: {
    query: (...args) => {
      const result = pending.then(() => client.query(...args));
      pending = result.then(() => {}, () => {});
      return result;
    },
  } };
  const records = new DailyReportRecordsService(postgres);
  const reportPonds = new DailyReportPondsService(postgres, records, {
    aerators: async () => new Map([[`pond-a-${suffix}`, { on: 1, total: 2 }]]),
  });
  try {
    await client.query('BEGIN');
    const company = (await client.query(`INSERT INTO companies (public_id,name,status)
      VALUES ($1,'Daily Source Test','active') RETURNING id`, [`company-${suffix}`])).rows[0].id;
    const farm = (await client.query(`INSERT INTO farms
      (public_id,company_id,name,location,status)
      VALUES ($1,$2,'Farm','Java','active') RETURNING id`,
    [`farm-${suffix}`, company])).rows[0].id;
    const ponds = [];
    for (const letter of ['a', 'b']) {
      ponds.push((await client.query(`INSERT INTO ponds
        (public_id,farm_id,name,area_ha) VALUES ($1,$2,$3,1) RETURNING id`,
      [`pond-${letter}-${suffix}`, farm, `Pond ${letter}`])).rows[0].id);
    }
    const user = (await client.query(`INSERT INTO users
      (public_id,company_id,name,email,password_hash,role,status)
      VALUES ($1,$2,'TM',$3,'test-hash','technical_manager','active') RETURNING id`,
    [`user-${suffix}`, company, `${suffix}@example.invalid`])).rows[0].id;
    await client.query(`INSERT INTO feeding_plan_rounds
      (pond_id,plan_date,round_no,scheduled_at,feed_type,amount_kg)
      VALUES ($1,'2026-10-12',1,'06:00','Grower 1',2),
             ($1,'2026-10-12',2,'18:00','Grower 2',3)`, [ponds[0]]);
    await client.query(`INSERT INTO feeding_records
      (public_id,pond_id,record_date,round_no,feed_type,amount_kg,recorded_by)
      VALUES ($1,$3,'2026-10-12',1,'Grower 1',2.25,$4),
             ($2,$3,'2026-10-12',2,'Grower 2',3.5,$4)`,
    [`feed-a-${suffix}`, `feed-b-${suffix}`, ponds[0], user]);
    await client.query(`INSERT INTO mortality_records
      (public_id,pond_id,record_date,count,weight_kg,recorded_by)
      VALUES ($1,$3,'2026-10-12',3,0.125,$4),
             ($2,$3,'2026-10-12',2,0.075,$4)`,
    [`mort-a-${suffix}`, `mort-b-${suffix}`, ponds[0], user]);
    await client.query(`INSERT INTO mortality_records
      (public_id,pond_id,record_date,count,weight_kg,recorded_by)
      VALUES ($1,$2,'2026-10-11',99,9,$3)`,
    [`mort-old-${suffix}`, ponds[0], user]);
    assert.deepEqual(await records.snapshot(farm, '2026-10-12'), {
      ponds: [
        { pond: { id: `pond-a-${suffix}`, name: 'Pond a' },
          feedKg: 5.75, feedRounds: 2, feedRoundsPlanned: 2,
          feedType: 'Grower 2', mortalityPcs: 5, mortalityKg: 0.2 },
        { pond: { id: `pond-b-${suffix}`, name: 'Pond b' },
          feedKg: 0, feedRounds: 0, feedRoundsPlanned: 0,
          feedType: null, mortalityPcs: 0, mortalityKg: 0 },
      ],
      totals: { feedKg: 5.75, mortalityPcs: 5, mortalityKg: 0.2 },
    });
    const old = await records.snapshot(farm, '2026-10-11');
    assert.equal(old.ponds[0].feedKg, 0);
    assert.equal(old.ponds[0].mortalityPcs, 99);
    const report = (await client.query(`INSERT INTO reports
      (public_id,farm_id,type,report_date,technical_manager_id,due_at)
      VALUES ($1,$2,'daily','2026-10-12',$3,'2026-10-12T11:00:00Z') RETURNING id`,
    [`report-${suffix}`, farm, user])).rows[0].id;
    const initial = await reportPonds.snapshot(report, farm, '2026-10-12');
    assert.equal(initial.ponds[0].appetite, 'good');
    assert.equal(initial.ponds[0].tray, 'clean');
    assert.equal(initial.ponds[0].health, 'normal');
    assert.deepEqual(initial.ponds[0].aerators, { on: 1, total: 2 });
    assert.deepEqual(initial.ponds[1].aerators, { on: 0, total: 0 });
    assert.deepEqual(initial.ponds[0].observations, []);
    assert.deepEqual(initial.totals, {
      feedKg: 5.75, mortalityPcs: 5, mortalityKg: 0.2,
      reducedAppetitePonds: 0, leftoverTrayPonds: 0, healthNotedPonds: 0,
    });
    await client.query(`INSERT INTO daily_report_pond_inputs
      (report_id,pond_id,appetite,health,observations,health_note)
      VALUES ($1,$2,'reduced','attention',ARRAY['reduced_appetite'],'Observed at 08:00')`,
    [report, ponds[0]]);
    const changed = await reportPonds.snapshot(report, farm, '2026-10-12');
    assert.equal(changed.ponds[0].appetite, 'reduced');
    assert.equal(changed.ponds[0].tray, 'clean');
    assert.equal(changed.ponds[0].health, 'attention');
    assert.deepEqual(changed.ponds[0].observations, ['reduced_appetite']);
    assert.equal(changed.ponds[0].healthNote, 'Observed at 08:00');
    assert.equal(changed.ponds[1].appetite, 'good');
    assert.equal(changed.totals.reducedAppetitePonds, 1);
    assert.equal(changed.totals.healthNotedPonds, 1);
  } finally {
    await client.query('ROLLBACK');
    client.release();
    await pool.end();
  }
});
