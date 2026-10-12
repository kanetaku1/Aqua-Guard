const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { test } = require('node:test');
const { createPostgresPool } = require('../dist/infrastructure/postgres');

test('weekly input tables store editable fields with stable action ordering', async () => {
  const pool = createPostgresPool();
  const client = await pool.connect();
  const suffix = randomUUID().slice(0, 8);
  try {
    await client.query('BEGIN');
    const company = (await client.query(`INSERT INTO companies (public_id,name,status)
      VALUES ($1,'Weekly Input Test','active') RETURNING id`,
    [`company-${suffix}`])).rows[0].id;
    const farm = (await client.query(`INSERT INTO farms
      (public_id,company_id,name,location,status)
      VALUES ($1,$2,'Farm','Java','active') RETURNING id`,
    [`farm-${suffix}`, company])).rows[0].id;
    const user = (await client.query(`INSERT INTO users
      (public_id,company_id,name,email,password_hash,role,status)
      VALUES ($1,$2,'TM',$3,'test-hash','technical_manager','active') RETURNING id`,
    [`user-${suffix}`, company, `${suffix}@example.invalid`])).rows[0].id;
    const pond = (await client.query(`INSERT INTO ponds
      (public_id,farm_id,name,area_ha) VALUES ($1,$2,'Pond',1) RETURNING id`,
    [`pond-${suffix}`, farm])).rows[0].id;
    const report = (await client.query(`INSERT INTO reports
      (public_id,farm_id,type,week_start,week_end,technical_manager_id,due_at)
      VALUES ($1,$2,'weekly','2026-10-12','2026-10-18',$3,'2026-10-19T05:00:00Z')
      RETURNING id`, [`weekly-${suffix}`, farm, user])).rows[0].id;
    await client.query(`INSERT INTO weekly_report_inputs
      (report_id,farm_condition,water_quality_comment,technical_summary)
      VALUES ($1,'attention','Water stable','Check growth')`, [report]);
    await client.query(`INSERT INTO weekly_report_major_actions
      (public_id,report_id,action_date,pond_id,action,sort_order)
      VALUES ($1,$2,'2026-10-14',$3,'Check aerator',0)`, [`action-${suffix}`, report, pond]);
    const saved = await client.query(`SELECT i.farm_condition,i.technical_summary,
      a.action,a.sort_order FROM weekly_report_inputs i
      JOIN weekly_report_major_actions a ON a.report_id=i.report_id
      WHERE i.report_id=$1`, [report]);
    assert.deepEqual(saved.rows[0], {
      farm_condition: 'attention', technical_summary: 'Check growth',
      action: 'Check aerator', sort_order: 0,
    });
    await client.query('SAVEPOINT duplicate_action');
    await assert.rejects(client.query(`INSERT INTO weekly_report_major_actions
      (public_id,report_id,action_date,action,sort_order)
      VALUES ($1,$2,'2026-10-15','Another action',0)`,
    [`another-${suffix}`, report]), (error) => error.code === '23505');
    await client.query('ROLLBACK TO SAVEPOINT duplicate_action');
  } finally {
    await client.query('ROLLBACK');
    client.release();
    await pool.end();
  }
});
