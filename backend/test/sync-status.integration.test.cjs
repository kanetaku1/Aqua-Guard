const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { test } = require('node:test');
const { RequestMethod } = require('@nestjs/common');
const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('../dist/app.module');
const { hashPassword } = require('../dist/auth/password');
const { ProblemFilter } = require('../dist/http/problem');
const { InfluxService } = require('../dist/infrastructure/influx.service');
const { FarmDeviceStatusService } = require('../dist/business/farm-device-status.service');
const { jakartaDate } = require('../dist/business/pond-planning.service');
const { createPostgresPool } = require('../dist/infrastructure/postgres');

test('scoped telemetry survives API restart and reports no data, offline, delayed and live', async () => {
  const pool = createPostgresPool();
  const suffix = randomUUID().slice(0, 8);
  const password = 'SafePassword123';
  const influxUrl = process.env.INFLUXDB_URL
    ?? `http://127.0.0.1:${process.env.INFLUXDB_PORT ?? '8086'}`;
  const influxHeaders = { Authorization: `Token ${process.env.INFLUXDB_ADMIN_TOKEN}` };
  const priorBucket = process.env.INFLUXDB_BUCKET;
  let bucketId;
  let companyId;
  const farmUuids = [];
  const pondUuids = [];
  const deviceUuids = [];
  const userUuids = [];
  const emails = [];
  let waterAlertId;
  let planningCycleId;
  let app;
  try {
    const orgResponse = await fetch(
      `${influxUrl}/api/v2/orgs?org=${encodeURIComponent(process.env.INFLUXDB_ORG ?? 'aquaguard')}`,
      { headers: influxHeaders },
    );
    assert.equal(orgResponse.status, 200);
    const orgId = (await orgResponse.json()).orgs[0].id;
    const bucketName = `aquaguard_sync_test_${randomUUID().replaceAll('-', '')}`;
    const bucketResponse = await fetch(`${influxUrl}/api/v2/buckets`, {
      method: 'POST',
      headers: { ...influxHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: bucketName, orgID: orgId }),
    });
    assert.equal(bucketResponse.status, 201);
    bucketId = (await bucketResponse.json()).id;
    process.env.INFLUXDB_BUCKET = bucketName;

    companyId = (await pool.query(
      `INSERT INTO companies (public_id, name, status)
       VALUES ($1, 'Sync Test', 'active') RETURNING id`, [`company-${suffix}`],
    )).rows[0].id;
    for (const letter of ['a', 'b']) {
      const farm = (await pool.query(
        `INSERT INTO farms (public_id, company_id, name, location, status)
         VALUES ($1, $2, $3, 'East Java', 'active') RETURNING id`,
        [`farm-${letter}-${suffix}`, companyId, `Farm ${letter.toUpperCase()}`],
      )).rows[0].id;
      farmUuids.push(farm);
      const pond = (await pool.query(
        `INSERT INTO ponds (public_id, farm_id, name, area_ha, status)
         VALUES ($1, $2, $3, 0.8, 'in_operation') RETURNING id`,
        [`pond-${letter}-${suffix}`, farm, `Pond ${letter.toUpperCase()}`],
      )).rows[0].id;
      pondUuids.push(pond);
    }
    const hash = await hashPassword(password);
    for (const role of ['farms_manager', 'technical_manager', 'system_administrator']) {
      const email = `${role}-${suffix}@example.test`;
      emails.push(email);
      const user = (await pool.query(
        `INSERT INTO users (public_id, company_id, name, email, password_hash, role, status)
         VALUES ($1, $2, $3, $4, $5, $6, 'active') RETURNING id`,
        [`${role}-${suffix}`, companyId, role, email, hash, role],
      )).rows[0].id;
      userUuids.push(user);
      if (role === 'technical_manager') await pool.query(
        `INSERT INTO user_farm_assignments (user_id, farm_id, assigned_at)
         VALUES ($1, $2, now())`, [user, farmUuids[0]],
      );
    }

    app = await NestFactory.create(AppModule, { logger: false });
    app.enableCsrfProtection();
    app.useGlobalFilters(new ProblemFilter());
    app.setGlobalPrefix('api/v1', { exclude: [
      { path: 'health', method: RequestMethod.GET },
      { path: 'health/ready', method: RequestMethod.GET },
    ] });
    await app.listen(0, '127.0.0.1');
    const base = `http://127.0.0.1:${app.getHttpServer().address().port}/api/v1`;
    const cookieFor = async (index) => {
      const login = await fetch(`${base}/auth/login`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: emails[index], password }),
      });
      assert.equal(login.status, 200);
      return login.headers.get('set-cookie').split(';')[0];
    };
    const fmCookie = await cookieFor(0);
    const tmCookie = await cookieFor(1);
    const saCookie = await cookieFor(2);
    const get = (cookie) => fetch(`${base}/sync-status`, { headers: { Cookie: cookie } });
    assert.equal((await get(saCookie)).status, 403);
    const empty = await get(tmCookie);
    assert.equal(empty.status, 200);
    const noData = await empty.json();
    assert.equal(noData.quality, 'no_data');
    assert.ok(Date.parse(noData.syncedAt));
    assert.ok(Date.parse(noData.nextSyncAt));
    const emptyWater = await fetch(
      `${base}/farms/farm-a-${suffix}/ponds/water-quality`,
      { headers: { Cookie: tmCookie } },
    );
    assert.equal(emptyWater.status, 200);
    const emptyRows = (await emptyWater.json()).items;
    assert.equal(emptyRows[0].values.do.quality, 'no_data');
    assert.equal(emptyRows[0].location, null);
    await pool.query('UPDATE ponds SET latitude = -6.259871, longitude = 106.644181 WHERE id = $1',
      [pondUuids[0]]);
    const locatedWater = await fetch(
      `${base}/farms/farm-a-${suffix}/ponds/water-quality`,
      { headers: { Cookie: tmCookie } },
    );
    assert.deepEqual((await locatedWater.json()).items[0].location,
      { lat: -6.259871, lng: 106.644181 });
    waterAlertId = (await pool.query(`INSERT INTO alerts
      (public_id,pond_id,parameter,severity,occurred_at)
      VALUES ($1,$2,'ph','warning',now()) RETURNING id`,
    [`ALT-early-${suffix}`, pondUuids[0]])).rows[0].id;
    const alertOnly = await fetch(
      `${base}/farms/farm-a-${suffix}/ponds/water-quality`,
      { headers: { Cookie: tmCookie } },
    );
    assert.equal((await alertOnly.json()).items[0].status, 'warning');
    await pool.query('DELETE FROM alerts WHERE id=$1', [waterAlertId]);
    waterAlertId = undefined;

    const influx = app.get(InfluxService);
    const write = async (letter, minutesAgo, value) => influx.writeSensorReadings([{
      farmId: `farm-${letter}-${suffix}`, pondId: `pond-${letter}-${suffix}`,
      deviceId: `sensor-${suffix}`, parameter: 'do', value,
      measuredAt: new Date(Date.now() - minutesAgo * 60 * 1000), receivedAt: new Date(),
      validity: 'valid',
    }]);
    await write('b', 0, 5.2);
    assert.equal((await (await get(fmCookie)).json()).quality, 'live');
    assert.equal((await (await get(tmCookie)).json()).quality, 'no_data');
    await write('a', 70, 4.1);
    assert.equal((await (await get(tmCookie)).json()).quality, 'offline');
    await write('a', 30, 4.4);
    assert.equal((await (await get(tmCookie)).json()).quality, 'delayed');
    await write('a', 0, 5.1);
    assert.equal((await (await get(tmCookie)).json()).quality, 'live');
    const range = new URLSearchParams({ parameter: 'do',
      from: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      to: new Date(Date.now() + 2 * 60 * 1000).toISOString(), interval: '5m' });
    const seriesUrl = `${base}/ponds/pond-a-${suffix}/sensors/series?${range}`;
    const seriesResponse = await fetch(seriesUrl, { headers: { Cookie: tmCookie } });
    assert.equal(seriesResponse.status, 200);
    const series = await seriesResponse.json();
    assert.equal(series.parameter, 'do');
    assert.equal(series.unit, 'mg/L');
    assert.equal(series.interval, '5m');
    assert.equal(series.threshold.warningLow, 4.5);
    assert.ok(series.points.some((point) => point.avg === 4.1));
    assert.ok(series.points.some((point) => point.avg === null));
    assert.ok(!series.points.some((point) => point.avg === 5.2));
    const deniedPond = await fetch(
      `${base}/ponds/pond-b-${suffix}/sensors/series?${range}`,
      { headers: { Cookie: tmCookie } },
    );
    assert.equal(deniedPond.status, 404);
    assert.equal((await fetch(seriesUrl, { headers: { Cookie: saCookie } })).status, 403);
    const badRange = new URLSearchParams(range);
    badRange.set('interval', 'toString');
    assert.equal((await fetch(
      `${base}/ponds/pond-a-${suffix}/sensors/series?${badRange}`,
      { headers: { Cookie: tmCookie } },
    )).status, 422);

    const thresholdUrl = `${base}/admin/settings/thresholds?farmId=farm-a-${suffix}`;
    const thresholdBefore = await fetch(thresholdUrl, { headers: { Cookie: saCookie } });
    assert.equal(thresholdBefore.status, 200);
    const doThreshold = (await thresholdBefore.json()).items[0];
    const thresholdSaved = await fetch(thresholdUrl, {
      method: 'PUT', headers: { Cookie: saCookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: [{ ...doThreshold, warningLow: 4, attentionLow: 4.5 }] }),
    });
    assert.equal(thresholdSaved.status, 200);
    const seriesWithOverride = await fetch(seriesUrl, { headers: { Cookie: tmCookie } });
    assert.equal(seriesWithOverride.status, 200);
    assert.equal((await seriesWithOverride.json()).threshold.warningLow, 4);
    const currentUrl = `${base}/ponds/pond-a-${suffix}/sensors/current`;
    const unconfigured = await fetch(currentUrl, { headers: { Cookie: tmCookie } });
    assert.equal(unconfigured.status, 200);
    const unconfiguredItems = (await unconfigured.json()).items;
    assert.equal(unconfiguredItems.length, 6);
    assert.ok(unconfiguredItems.every((item) => item.value === null
      && item.quality === 'no_data' && item.severity === 'normal' && item.measuredAt === null));
    const detailUrl = `${base}/ponds/pond-a-${suffix}`;
    assert.equal((await fetch(detailUrl, { headers: { Cookie: tmCookie } })).status, 200);
    const unconfiguredList = await fetch(`${base}/farms/farm-a-${suffix}/ponds`,
      { headers: { Cookie: tmCookie } });
    assert.equal(unconfiguredList.status, 200);
    assert.equal((await unconfiguredList.json()).items.length, 1);
    assert.equal((await fetch(detailUrl, { headers: { Cookie: fmCookie } })).status, 403);
    assert.equal((await fetch(`${base}/ponds/pond-b-${suffix}`,
      { headers: { Cookie: tmCookie } })).status, 404);
    const parameters = ['do', 'ph', 'temperature', 'tds', 'turbidity', 'water_level'];
    for (const parameter of parameters) {
      const deviceId = `current-${parameter}-${suffix}`;
      const deviceUuid = (await pool.query(
        `INSERT INTO devices (device_id, type, parameter)
         VALUES ($1, 'sensor', $2) RETURNING id`, [deviceId, parameter],
      )).rows[0].id;
      deviceUuids.push(deviceUuid);
      await pool.query(
        `INSERT INTO device_assignments (device_id, pond_id, assigned_at)
         VALUES ($1, $2, now()-interval '1 day')`, [deviceUuid, pondUuids[0]],
      );
    }
    const influxCurrent = app.get(InfluxService);
    await influxCurrent.writeSensorReadings(parameters.map((parameter) => ({
      farmId: `farm-a-${suffix}`, pondId: `pond-a-${suffix}`,
      deviceId: `current-${parameter}-${suffix}`, parameter,
      value: parameter === 'do' ? 3 : parameter === 'ph' ? 8 : 130,
      measuredAt: new Date(Date.now() - (parameter === 'ph' ? 30 : 2) * 60000),
      receivedAt: new Date(), validity: 'valid',
    })));
    const currentResponse = await fetch(currentUrl, { headers: { Cookie: tmCookie } });
    assert.equal(currentResponse.status, 200);
    const current = await currentResponse.json();
    assert.equal(current.items.length, 6);
    assert.equal(current.items.find((item) => item.parameter === 'do').severity, 'critical');
    assert.equal(current.items.find((item) => item.parameter === 'do').threshold.warningLow, 4);
    assert.equal(current.items.find((item) => item.parameter === 'ph').severity, 'normal');
    assert.equal(current.items.find((item) => item.parameter === 'ph').quality, 'delayed');
    assert.ok(current.items.filter((item) => item.parameter !== 'ph')
      .every((item) => item.quality === 'live'));
    const today = jakartaDate();
    const stockedOn = new Date(Date.parse(`${today}T00:00:00Z`) - 30 * 86400000)
      .toISOString().slice(0, 10);
    planningCycleId = (await pool.query(`INSERT INTO production_cycles
      (pond_id,started_on,status) VALUES ($1,$2,'active') RETURNING id`,
    [pondUuids[0], stockedOn])).rows[0].id;
    await pool.query(`INSERT INTO stocking_records
      (public_id,cycle_id,pond_id,stocked_on,stocked_pl,recorded_by)
      VALUES ($1,$2,$3,$4,10000,$5)`,
    [`stock-${suffix}`, planningCycleId, pondUuids[0], stockedOn, userUuids[1]]);
    await pool.query(`INSERT INTO feeding_plan_rounds
      (pond_id,plan_date,round_no,scheduled_at,feed_type,amount_kg)
      VALUES ($1,$2,1,'06:00','Grower',12),($1,$2,2,'12:00','Grower',10)`,
    [pondUuids[0], today]);
    const detailResponse = await fetch(detailUrl, { headers: { Cookie: tmCookie } });
    assert.equal(detailResponse.status, 200);
    const detail = await detailResponse.json();
    assert.deepEqual(detail.pond, { id: `pond-a-${suffix}`, name: 'Pond A' });
    assert.deepEqual(detail.farm, { id: `farm-a-${suffix}`, name: 'Farm A' });
    assert.equal(detail.status, 'critical');
    assert.equal(detail.areaHa, 0.8);
    assert.equal(detail.stockedOn, stockedOn);
    assert.equal(detail.doc, 30);
    assert.equal(detail.stockedPl, 10000);
    assert.equal(detail.abwG, null);
    assert.equal(detail.openAlerts, 0);
    assert.deepEqual(detail.feeding.schedule, ['06:00', '12:00']);
    assert.deepEqual(detail.feeding.planToday.map((row) => row.amountKg), [12, 10]);
    assert.ok(Date.parse(detail.updatedAt));
    await pool.query(`INSERT INTO sampling_records
      (public_id,pond_id,cycle_id,sample_date,sample_count,sample_weight_g,recorded_by)
      VALUES ($1,$2,$3,$4,100,2500,$5)`,
    [`SMP-detail-${suffix}`, pondUuids[0], planningCycleId, today, userUuids[1]]);
    assert.equal((await (await fetch(detailUrl,
      { headers: { Cookie: tmCookie } })).json()).abwG, 25);
    await pool.query(`INSERT INTO feeding_records
      (public_id,pond_id,cycle_id,record_date,round_no,feed_type,amount_kg,recorded_by)
      VALUES ($1,$2,$3,$4,1,'Grower',12,$5)`,
    [`FED-list-${suffix}`, pondUuids[0], planningCycleId, today, userUuids[1]]);
    await pool.query(`INSERT INTO mortality_records
      (public_id,pond_id,cycle_id,record_date,count,weight_kg,recorded_by)
      VALUES ($1,$2,$3,$4,2,0.1,$5)`,
    [`MOR-list-${suffix}`, pondUuids[0], planningCycleId, today, userUuids[1]]);
    const pondListUrl = `${base}/farms/farm-a-${suffix}/ponds`;
    assert.equal((await fetch(pondListUrl, { headers: { Cookie: fmCookie } })).status, 403);
    assert.equal((await fetch(`${base}/farms/farm-b-${suffix}/ponds`,
      { headers: { Cookie: tmCookie } })).status, 404);
    assert.equal((await fetch(`${pondListUrl}?status=broken`,
      { headers: { Cookie: tmCookie } })).status, 422);
    const initialList = await fetch(pondListUrl, { headers: { Cookie: tmCookie } });
    assert.equal(initialList.status, 200);
    const listed = await initialList.json();
    assert.equal(listed.latestSamplingDate, today);
    assert.equal(listed.items.length, 1);
    assert.equal(listed.items[0].status, 'critical');
    assert.equal(listed.items[0].abwG, 25);
    assert.ok(listed.items[0].vsTargetPct > 0);
    assert.equal(listed.items[0].growth, 'ahead');
    assert.equal(listed.items[0].feedTodayKg, 12);
    assert.equal(listed.items[0].feedRoundsToday, 1);
    assert.equal(listed.items[0].feedRoundsPlanned, 2);
    assert.equal(listed.items[0].mortalityTodayPcs, 2);
    assert.deepEqual(listed.items[0].aerators, { on: 0, total: 0 });
    const waterUrl = `${base}/farms/farm-a-${suffix}/ponds/water-quality`;
    assert.equal((await fetch(waterUrl, { headers: { Cookie: fmCookie } })).status, 403);
    assert.equal((await fetch(`${base}/farms/farm-b-${suffix}/ponds/water-quality`,
      { headers: { Cookie: tmCookie } })).status, 404);
    waterAlertId = (await pool.query(`INSERT INTO alerts
      (public_id,pond_id,parameter,severity,occurred_at)
      VALUES ($1,$2,'ph','warning',now()) RETURNING id`,
    [`ALT-water-${suffix}`, pondUuids[0]])).rows[0].id;
    const waterResponse = await fetch(waterUrl, { headers: { Cookie: tmCookie } });
    assert.equal(waterResponse.status, 200);
    const water = await waterResponse.json();
    assert.equal(water.items.length, 1);
    assert.deepEqual(water.counts, { normal: 0, attention: 0, warning: 0, critical: 1 });
    assert.equal(water.items[0].status, 'critical');
    assert.equal(water.items[0].openAlerts, 1);
    assert.equal(water.items[0].worstAlertState, 'unacknowledged');
    assert.equal(water.items[0].values.do.value, 3);
    assert.equal(water.items[0].values.do.severity, 'critical');
    assert.equal(water.items[0].values.ph.quality, 'delayed');
    assert.equal((await (await fetch(detailUrl,
      { headers: { Cookie: tmCookie } })).json()).openAlerts, 1);
    assert.equal(water.normalRanges.find((row) => row.parameter === 'do').normalMin, 4.5);
    const deviceStatus = app.get(FarmDeviceStatusService);
    const initialDevices = await deviceStatus.snapshot(companyId, farmUuids[0],
      `farm-a-${suffix}`);
    assert.equal(initialDevices.sensors.online, 6);
    assert.equal(initialDevices.sensors.total, 6);
    for (const [name, type, parameter] of [
      ['old-ph', 'sensor', 'ph'], ['aerator', 'aerator', null], ['pump', 'pump', null],
    ]) {
      const id = (await pool.query(`INSERT INTO devices (device_id,type,parameter)
        VALUES ($1,$2,$3) RETURNING id`, [`${name}-${suffix}`, type, parameter])).rows[0].id;
      deviceUuids.push(id);
      await pool.query(`INSERT INTO device_assignments (device_id,pond_id,assigned_at)
        VALUES ($1,$2,now()-interval '1 day')`, [id, pondUuids[0]]);
    }
    const oldAt = new Date(Date.now() - 70 * 60000);
    await influxCurrent.writeSensorReadings([{
      farmId: `farm-a-${suffix}`, pondId: `pond-a-${suffix}`,
      deviceId: `old-ph-${suffix}`, parameter: 'ph', value: 7.8,
      measuredAt: oldAt, receivedAt: new Date(), validity: 'valid',
    }]);
    const missingFeedback = await deviceStatus.snapshot(companyId, farmUuids[0],
      `farm-a-${suffix}`);
    assert.equal(missingFeedback.sensors.offline.length, 1);
    assert.equal(missingFeedback.sensors.offline[0].deviceId, `old-ph-${suffix}`);
    assert.equal(missingFeedback.aerators.unknown, 1);
    assert.equal(missingFeedback.aerators.on, 0);
    const unknownAerator = await fetch(pondListUrl, { headers: { Cookie: tmCookie } });
    assert.equal(unknownAerator.status, 200);
    assert.deepEqual((await unknownAerator.json()).items[0].aerators, { on: 0, total: 1 });
    await influxCurrent.writeActuatorFeedback(['aerator', 'pump'].map((name) => ({
      farmId: `farm-a-${suffix}`, pondId: `pond-a-${suffix}`,
      deviceId: `${name}-${suffix}`, state: name === 'aerator' ? 'on' : 'fault',
      occurredAt: new Date(Date.now() - 1000), receivedAt: new Date(),
    })));
    const withFeedback = await deviceStatus.snapshot(companyId, farmUuids[0],
      `farm-a-${suffix}`);
    assert.equal(withFeedback.aerators.on, 1);
    assert.deepEqual(withFeedback.equipmentFaults, [`pump-${suffix}`]);
    const activeList = await fetch(`${pondListUrl}?status=critical&alertState=unacknowledged`,
      { headers: { Cookie: tmCookie } });
    assert.equal(activeList.status, 200);
    assert.deepEqual((await activeList.json()).items[0].aerators, { on: 1, total: 1 });
    assert.equal((await (await fetch(`${pondListUrl}?status=normal`,
      { headers: { Cookie: tmCookie } })).json()).items.length, 0);
    await influxCurrent.writeActuatorFeedback([{
      farmId: `farm-a-${suffix}`, pondId: `pond-a-${suffix}`,
      deviceId: `aerator-${suffix}`, state: 'fault',
      occurredAt: new Date(), receivedAt: new Date(),
    }]);
    assert.deepEqual((await (await fetch(pondListUrl,
      { headers: { Cookie: tmCookie } })).json()).items[0].aerators,
    { on: 0, total: 1 });
    await influxCurrent.writeDeviceHeartbeats([{
      farmId: `farm-a-${suffix}`, pondId: `pond-a-${suffix}`,
      deviceId: `aerator-${suffix}`, sentAt: new Date(), receivedAt: new Date(),
      onlineHint: false,
    }]);
    const disconnected = await deviceStatus.snapshot(companyId, farmUuids[0],
      `farm-a-${suffix}`);
    assert.deepEqual(disconnected.equipmentOffline, [`aerator-${suffix}`]);
    assert.equal(disconnected.aerators.on, 0);
    const disconnectedList = await fetch(pondListUrl, { headers: { Cookie: tmCookie } });
    assert.equal(disconnectedList.status, 200);
    assert.deepEqual((await disconnectedList.json()).items[0].aerators, { on: 0, total: 1 });
    assert.equal((await fetch(currentUrl, { headers: { Cookie: saCookie } })).status, 403);
    assert.equal((await fetch(`${base}/ponds/pond-b-${suffix}/sensors/current`,
      { headers: { Cookie: tmCookie } })).status, 404);
    const checkpoint = await pool.query(
      'SELECT last_success_at, processed_through FROM sensor_sync_checkpoints WHERE scope_key = $1',
      [`header:user:${userUuids[1]}`],
    );
    assert.ok(checkpoint.rows[0].last_success_at);
    assert.ok(checkpoint.rows[0].processed_through);

    await app.close();
    app = await NestFactory.create(AppModule, { logger: false });
    app.enableCsrfProtection();
    app.useGlobalFilters(new ProblemFilter());
    app.setGlobalPrefix('api/v1', { exclude: [
      { path: 'health', method: RequestMethod.GET },
      { path: 'health/ready', method: RequestMethod.GET },
    ] });
    await app.listen(0, '127.0.0.1');
    const restartedBase = `http://127.0.0.1:${app.getHttpServer().address().port}/api/v1`;
    const afterRestart = await fetch(`${restartedBase}/sync-status`, {
      headers: { Cookie: tmCookie },
    });
    assert.equal(afterRestart.status, 200);
    assert.equal((await afterRestart.json()).quality, 'live');
    const restartedSeries = await fetch(
      `${restartedBase}/ponds/pond-a-${suffix}/sensors/series?${range}`,
      { headers: { Cookie: tmCookie } },
    );
    assert.equal(restartedSeries.status, 200);
    const saved = await restartedSeries.json();
    assert.equal(saved.threshold.warningLow, 4);
    assert.ok(saved.points.some((point) => point.avg === 4.1));
    const restoredCurrent = await fetch(
      `${restartedBase}/ponds/pond-a-${suffix}/sensors/current`,
      { headers: { Cookie: tmCookie } },
    );
    assert.equal(restoredCurrent.status, 200);
    assert.equal((await restoredCurrent.json()).items.find((item) => item.parameter === 'do').severity,
      'critical');
    await app.get(InfluxService).writeSensorReadings([{
      farmId: `farm-a-${suffix}`, pondId: `pond-a-${suffix}`,
      deviceId: `current-do-${suffix}`, parameter: 'do', value: 2.5,
      measuredAt: new Date(Date.now() - 60000), receivedAt: new Date(), validity: 'invalid',
    }]);
    const invalidCurrent = await fetch(
      `${restartedBase}/ponds/pond-a-${suffix}/sensors/current`,
      { headers: { Cookie: tmCookie } },
    );
    assert.equal(invalidCurrent.status, 200);
    const invalidDo = (await invalidCurrent.json()).items.find((item) => item.parameter === 'do');
    assert.equal(invalidDo.value, null);
    assert.equal(invalidDo.quality, 'no_data');
    assert.equal(invalidDo.severity, 'normal');
    const unavailableWater = await fetch(
      `${restartedBase}/farms/farm-a-${suffix}/ponds/water-quality`,
      { headers: { Cookie: tmCookie } },
    );
    assert.equal(unavailableWater.status, 200);
    assert.equal((await unavailableWater.json()).items[0].values.do.value, null);
    const cleanSeries = await fetch(
      `${restartedBase}/ponds/pond-a-${suffix}/sensors/series?${range}`,
      { headers: { Cookie: tmCookie } },
    );
    assert.equal(cleanSeries.status, 200);
    assert.ok(!(await cleanSeries.json()).points.some((point) => point.min === 2.5));
  } finally {
    if (app) await app.close();
    if (pondUuids[0]) {
      await pool.query('DELETE FROM feeding_records WHERE pond_id=$1', [pondUuids[0]]);
      await pool.query('DELETE FROM mortality_records WHERE pond_id=$1', [pondUuids[0]]);
      await pool.query('DELETE FROM sampling_records WHERE pond_id=$1', [pondUuids[0]]);
      await pool.query('DELETE FROM feeding_plan_rounds WHERE pond_id=$1', [pondUuids[0]]);
      await pool.query('DELETE FROM stocking_records WHERE pond_id=$1', [pondUuids[0]]);
    }
    if (planningCycleId) await pool.query('DELETE FROM production_cycles WHERE id=$1',
      [planningCycleId]);
    if (companyId) {
      await pool.query(`DELETE FROM growth_target_points WHERE set_id IN
        (SELECT id FROM growth_target_sets WHERE company_id=$1)`, [companyId]);
      await pool.query('DELETE FROM growth_target_sets WHERE company_id=$1', [companyId]);
      await pool.query(`DELETE FROM threshold_values WHERE set_id IN
        (SELECT id FROM threshold_sets WHERE company_id = $1)`, [companyId]);
      await pool.query('DELETE FROM threshold_sets WHERE company_id = $1', [companyId]);
    }
    for (const userId of userUuids) {
      await pool.query('DELETE FROM sensor_sync_checkpoints WHERE scope_key = $1',
        [`header:user:${userId}`]);
      await pool.query('DELETE FROM auth_sessions WHERE user_id = $1', [userId]);
      await pool.query('DELETE FROM user_farm_assignments WHERE user_id = $1', [userId]);
      await pool.query('DELETE FROM users WHERE id = $1', [userId]);
    }
    if (emails.length) await pool.query('DELETE FROM auth_attempts WHERE email_key = ANY($1)',
      [emails]);
    for (const deviceId of deviceUuids) {
      await pool.query('DELETE FROM device_assignments WHERE device_id = $1', [deviceId]);
      await pool.query('DELETE FROM devices WHERE id = $1', [deviceId]);
    }
    if (waterAlertId) await pool.query('DELETE FROM alerts WHERE id=$1', [waterAlertId]);
    for (const pondId of pondUuids) await pool.query('DELETE FROM ponds WHERE id = $1', [pondId]);
    for (const farmId of farmUuids) await pool.query('DELETE FROM farms WHERE id = $1', [farmId]);
    if (companyId) await pool.query('DELETE FROM companies WHERE id = $1', [companyId]);
    await pool.end();
    if (priorBucket === undefined) delete process.env.INFLUXDB_BUCKET;
    else process.env.INFLUXDB_BUCKET = priorBucket;
    if (bucketId) {
      const removed = await fetch(`${influxUrl}/api/v2/buckets/${bucketId}`, {
        method: 'DELETE', headers: influxHeaders,
      });
      assert.equal(removed.status, 204);
    }
  }
});
