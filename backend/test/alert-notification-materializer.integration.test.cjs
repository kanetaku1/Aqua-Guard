const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { test } = require('node:test');
const { createPostgresPool } = require('../dist/infrastructure/postgres');
const { AlertNotificationMaterializerService } = require(
  '../dist/infrastructure/alert-notification-materializer.service');

test('critical outbox creates durable records for active FM and assigned TM only', async () => {
  const pool = createPostgresPool();
  const service = new AlertNotificationMaterializerService({ pool });
  const suffix = randomUUID().slice(0, 8);
  const companies = [];
  const farms = [];
  const ponds = [];
  const users = [];
  const alerts = [];
  const outboxes = [];
  try {
    async function company(name) {
      const id = (await pool.query(`INSERT INTO companies (public_id,name,status)
        VALUES ($1,$2,'active') RETURNING id`, [`company-${name}-${suffix}`, name])).rows[0].id;
      companies.push(id);
      return id;
    }
    async function farm(companyId, name) {
      const id = (await pool.query(`INSERT INTO farms
        (public_id,company_id,name,location,status)
        VALUES ($1,$2,$3,'Java','active') RETURNING id`,
      [`farm-${name}-${suffix}`, companyId, name])).rows[0].id;
      farms.push(id);
      return id;
    }
    async function pond(farmId, name) {
      const id = (await pool.query(`INSERT INTO ponds (public_id,farm_id,name,area_ha)
        VALUES ($1,$2,$3,1) RETURNING id`,
      [`pond-${name}-${suffix}`, farmId, name])).rows[0].id;
      ponds.push(id);
      return id;
    }
    async function user(companyId, name, role, status = 'active') {
      const id = (await pool.query(`INSERT INTO users
        (public_id,company_id,name,email,password_hash,role,status)
        VALUES ($1,$2,$3,$4,'test-hash',$5,$6) RETURNING id`,
      [`user-${name}-${suffix}`, companyId, name, `${name}-${suffix}@example.invalid`,
        role, status])).rows[0].id;
      users.push(id);
      return id;
    }
    async function alert(pondId, name) {
      const id = (await pool.query(`INSERT INTO alerts
        (public_id,pond_id,parameter,severity,occurred_at)
        VALUES ($1,$2,'do','critical',now()) RETURNING id`,
      [`ALT-${name}-${suffix}`, pondId])).rows[0].id;
      alerts.push(id);
      const outboxId = (await pool.query(`INSERT INTO alert_notification_outbox
        (alert_id,event_kind) VALUES ($1,'critical_detected') RETURNING id`, [id])).rows[0].id;
      outboxes.push(outboxId);
      return outboxId;
    }

    const companyId = await company('primary');
    const farmId = await farm(companyId, 'target');
    const otherFarmId = await farm(companyId, 'other');
    const targetPondId = await pond(farmId, 'target');
    const fmId = await user(companyId, 'fm', 'farms_manager');
    const tmId = await user(companyId, 'tm', 'technical_manager');
    const otherTmId = await user(companyId, 'other-tm', 'technical_manager');
    await user(companyId, 'disabled-fm', 'farms_manager', 'deactivated');
    await pool.query(`INSERT INTO user_farm_assignments (user_id,farm_id,assigned_at)
      VALUES ($1,$2,now())`, [tmId, farmId]);
    await pool.query(`INSERT INTO user_farm_assignments (user_id,farm_id,assigned_at)
      VALUES ($1,$2,now())`, [otherTmId, otherFarmId]);
    const outsiderCompany = await company('outsider');
    await user(outsiderCompany, 'outsider-fm', 'farms_manager');
    const emptyCompany = await company('empty');
    const emptyFarm = await farm(emptyCompany, 'empty');
    const emptyPond = await pond(emptyFarm, 'empty');
    const outboxId = await alert(targetPondId, 'target');
    const emptyOutboxId = await alert(emptyPond, 'empty');

    assert.deepEqual(await service.runOnce(),
      { materialized: 1, noRecipient: 1, failed: 0 });
    const recipients = await pool.query(`SELECT user_id FROM alert_notifications
      WHERE outbox_id=$1 ORDER BY user_id`, [outboxId]);
    assert.deepEqual(recipients.rows.map((row) => row.user_id), [fmId, tmId].sort());
    assert.equal((await pool.query(`SELECT status FROM alert_notification_outbox
      WHERE id=$1`, [outboxId])).rows[0].status, 'materialized');
    assert.equal((await pool.query(`SELECT status FROM alert_notification_outbox
      WHERE id=$1`, [emptyOutboxId])).rows[0].status, 'no_recipient');
    await pool.query(`UPDATE alert_notification_outbox SET status='pending',
      materialized_at=NULL WHERE id=$1`, [outboxId]);
    assert.deepEqual(await service.runOnce(),
      { materialized: 1, noRecipient: 0, failed: 0 });
    assert.equal((await pool.query(`SELECT count(*)::integer AS count
      FROM alert_notifications WHERE outbox_id=$1`, [outboxId])).rows[0].count, 2);
    await pool.query(`UPDATE alert_notification_outbox SET status='pending',
      materialized_at=NULL WHERE id=$1`, [outboxId]);
    const insertRecipients = service.insertRecipients.bind(service);
    service.insertRecipients = async () => { throw new Error('simulated materialization outage'); };
    assert.deepEqual(await service.runOnce(),
      { materialized: 0, noRecipient: 0, failed: 1 });
    const failed = (await pool.query(`SELECT status,attempt_count,next_attempt_at,last_error
      FROM alert_notification_outbox WHERE id=$1`, [outboxId])).rows[0];
    assert.equal(failed.status, 'failed');
    assert.ok(failed.next_attempt_at > new Date());
    assert.match(failed.last_error, /simulated materialization outage/);
    service.insertRecipients = insertRecipients;
    await pool.query(`UPDATE alert_notification_outbox SET next_attempt_at=now()-interval '1 second'
      WHERE id=$1`, [outboxId]);
    assert.deepEqual(await service.runOnce(),
      { materialized: 1, noRecipient: 0, failed: 0 });
    assert.equal((await pool.query(`SELECT count(*)::integer AS count
      FROM alert_notifications WHERE outbox_id=$1`, [outboxId])).rows[0].count, 2);
  } finally {
    for (const id of outboxes) {
      await pool.query('DELETE FROM alert_notifications WHERE outbox_id=$1', [id]);
      await pool.query('DELETE FROM alert_notification_outbox WHERE id=$1', [id]);
    }
    for (const id of alerts) await pool.query('DELETE FROM alerts WHERE id=$1', [id]);
    for (const id of users) {
      await pool.query('DELETE FROM user_farm_assignments WHERE user_id=$1', [id]);
      await pool.query('DELETE FROM users WHERE id=$1', [id]);
    }
    for (const id of ponds) await pool.query('DELETE FROM ponds WHERE id=$1', [id]);
    for (const id of farms) await pool.query('DELETE FROM farms WHERE id=$1', [id]);
    for (const id of companies) await pool.query('DELETE FROM companies WHERE id=$1', [id]);
    await pool.end();
  }
});
