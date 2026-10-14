import { randomUUID } from 'node:crypto';
import { parseArgs } from 'node:util';
import type { PoolClient } from 'pg';
import { createPostgresPool } from '../infrastructure/postgres';
import { jakartaDate } from '../business/pond-planning.service';

/**
 * Development tool: start a production cycle with its stocking record for one Pond.
 * The current OpenAPI has no stocking API, so Sampling, DOC and production KPIs
 * cannot be exercised locally without this (see docs/database_design.md, 未決事項).
 */
export interface RegisterStockingInput {
  pond: string;
  farm?: string;
  stockedOn: string;
  stockedPl: number;
  initialBiomassKg?: number;
  recordedBy?: string;
}

export interface RegisteredStocking {
  pondId: string; pondName: string; farmId: string;
  cycleId: string; stockingId: string; recordedBy: string;
}

interface PondRow {
  id: string; public_id: string; name: string; status: string;
  farm_uuid: string; farm_id: string; company_id: string;
}

export async function registerStocking(
  client: PoolClient, input: RegisterStockingInput, today = jakartaDate(),
): Promise<RegisteredStocking> {
  if (!input.pond?.trim()) throw new Error('--pond is required (Pond ID or name)');
  if (!/^\d{4}-\d\d-\d\d$/.test(input.stockedOn)
    || new Date(`${input.stockedOn}T00:00:00Z`).toISOString().slice(0, 10) !== input.stockedOn) {
    throw new Error('--stocked-on must be a date in YYYY-MM-DD format');
  }
  if (input.stockedOn > today) throw new Error('--stocked-on cannot be in the future');
  if (!Number.isInteger(input.stockedPl) || input.stockedPl <= 0) {
    throw new Error('--pl must be a positive integer');
  }
  if (input.initialBiomassKg !== undefined
    && (!Number.isFinite(input.initialBiomassKg) || input.initialBiomassKg < 0)) {
    throw new Error('--biomass-kg must be zero or a positive number');
  }

  const ponds = await client.query<PondRow>(
    `SELECT p.id, p.public_id, p.name, p.status, f.id AS farm_uuid,
       f.public_id AS farm_id, f.company_id
     FROM ponds p JOIN farms f ON f.id = p.farm_id
     WHERE (p.public_id = $1 OR p.name = $1)
       AND ($2::text IS NULL OR f.public_id = $2 OR f.name = $2)
     ORDER BY f.name, p.name`,
    [input.pond.trim(), input.farm?.trim() || null],
  );
  if (ponds.rows.length === 0) throw new Error(`Pond not found: ${input.pond}`);
  if (ponds.rows.length > 1) {
    throw new Error(`Pond name is ambiguous; pass --farm or the Pond ID: ${
      ponds.rows.map((row) => `${row.farm_id}/${row.public_id}`).join(', ')}`);
  }
  const pond = ponds.rows[0];
  if (pond.status === 'fallow') {
    throw new Error(`${pond.name} is fallow; change the Pond status before stocking it`);
  }

  // Serialize with other cycle changes for this Pond.
  await client.query('SELECT id FROM ponds WHERE id = $1 FOR UPDATE', [pond.id]);
  const active = await client.query<{ started_on: string }>(
    `SELECT to_char(started_on, 'YYYY-MM-DD') AS started_on FROM production_cycles
     WHERE pond_id = $1 AND status = 'active'`, [pond.id],
  );
  if (active.rows[0]) {
    throw new Error(`${pond.name} already has an active cycle stocked on ${active.rows[0].started_on}`);
  }
  const overlap = await client.query(
    `SELECT 1 FROM production_cycles WHERE pond_id = $1 AND ended_on >= $2::date`,
    [pond.id, input.stockedOn],
  );
  if (overlap.rowCount) {
    throw new Error(`--stocked-on must be after the end of the previous cycle of ${pond.name}`);
  }

  const recorder = await client.query<{ id: string; email: string }>(
    input.recordedBy?.trim()
      ? `SELECT id, email FROM users WHERE company_id = $1 AND lower(email) = lower($2)`
      : `SELECT u.id, u.email FROM users u
         LEFT JOIN user_farm_assignments a ON a.user_id = u.id
           AND a.unassigned_at IS NULL AND a.farm_id = $2
         WHERE u.company_id = $1 AND u.status = 'active'
           AND (u.role = 'system_administrator' OR (u.role = 'technical_manager' AND a.id IS NOT NULL))
         ORDER BY (u.role = 'technical_manager') DESC, u.created_at
         LIMIT 1`,
    input.recordedBy?.trim()
      ? [pond.company_id, input.recordedBy.trim()]
      : [pond.company_id, pond.farm_uuid],
  );
  if (!recorder.rows[0]) {
    throw new Error(input.recordedBy
      ? `User not found in the Pond's company: ${input.recordedBy}`
      : 'No active Technical Manager or administrator to record the stocking; pass --recorded-by');
  }

  const cycle = await client.query<{ id: string }>(
    `INSERT INTO production_cycles (pond_id, started_on, status)
     VALUES ($1, $2, 'active') RETURNING id`, [pond.id, input.stockedOn],
  );
  const stockingId = `STK-${randomUUID()}`;
  await client.query(
    `INSERT INTO stocking_records
       (public_id, cycle_id, pond_id, stocked_on, stocked_pl, initial_biomass_kg, recorded_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [stockingId, cycle.rows[0].id, pond.id, input.stockedOn, input.stockedPl,
      input.initialBiomassKg ?? null, recorder.rows[0].id],
  );
  return { pondId: pond.public_id, pondName: pond.name, farmId: pond.farm_id,
    cycleId: cycle.rows[0].id, stockingId, recordedBy: recorder.rows[0].email };
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      pond: { type: 'string' }, farm: { type: 'string' },
      'stocked-on': { type: 'string' }, pl: { type: 'string' },
      'biomass-kg': { type: 'string' }, 'recorded-by': { type: 'string' },
    },
  });
  const input: RegisterStockingInput = {
    pond: values.pond ?? '',
    farm: values.farm,
    stockedOn: values['stocked-on'] ?? '',
    stockedPl: Number(values.pl),
    initialBiomassKg: values['biomass-kg'] === undefined ? undefined : Number(values['biomass-kg']),
    recordedBy: values['recorded-by'],
  };
  const pool = createPostgresPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await registerStocking(client, input);
    await client.query('COMMIT');
    console.log(`Stocked ${result.pondName} (${result.farmId}/${result.pondId}) on ${input.stockedOn}`
      + ` with ${input.stockedPl} PL as ${result.stockingId}, recorded by ${result.recordedBy}`);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

if (require.main === module) {
  void main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
