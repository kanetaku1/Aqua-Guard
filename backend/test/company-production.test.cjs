const assert = require('node:assert/strict');
const { test } = require('node:test');
const { CompanyProductionService } = require('../dist/business/company-production.service');

test('company production sums biomass and weights survival by stocked PL', async () => {
  const calls = [];
  const service = new CompanyProductionService({ pool: { query: async (sql, values) => {
    assert.match(sql, /status='active'/);
    assert.deepEqual(values, ['company-id']);
    return { rows: [{ public_id: 'farm-a' }, { public_id: 'farm-b' }] };
  } } }, { get: async (_principal, farmId) => {
    calls.push(farmId);
    return farmId === 'farm-a'
      ? { samplingDate: '2026-10-12', kpis: { biomassKg: 90,
        growthDistribution: { behind: 1 } },
      ponds: [{ stockedPl: 10000, survivalRatePct: 90 }] }
      : { samplingDate: '2026-10-15', kpis: { biomassKg: 380,
        growthDistribution: { behind: 0 } },
      ponds: [{ stockedPl: 20000, survivalRatePct: 95 }] };
  } });
  const result = await service.get({ role: 'farms_manager', companyId: 'company-id' });
  assert.deepEqual(calls, ['farm-a', 'farm-b']);
  assert.deepEqual(result, {
    biomassKg: 470, survivalRatePct: 28000 / 30000 * 100,
    pondsBehind: 1, pondsTotal: 2, latestSamplingDate: '2026-10-15',
  });
  await assert.rejects(() => service.get({ role: 'technical_manager',
    companyId: 'company-id' }), (error) => error.getStatus() === 403);
});
