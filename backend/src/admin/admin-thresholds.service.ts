import { Injectable } from '@nestjs/common';
import { PoolClient } from 'pg';
import { ApiProblem } from '../http/problem';
import { PostgresService } from '../infrastructure/postgres.service';
import { inputObject } from './admin-input';
import { UserScope } from './admin-users.service';

const BOUNDARIES = [
  'criticalLow', 'warningLow', 'attentionLow',
  'attentionHigh', 'warningHigh', 'criticalHigh',
] as const;
type Boundary = typeof BOUNDARIES[number];
type Sides = 'low' | 'high' | 'both';
interface Threshold {
  parameter: string; unit: string; sides: Sides; inherited?: boolean;
  criticalLow: number | null; warningLow: number | null; attentionLow: number | null;
  attentionHigh: number | null; warningHigh: number | null; criticalHigh: number | null;
}
interface SetRow {
  id: string; updated_at: Date; updated_by_id: string; updated_by_name: string;
}
interface ValueRow {
  parameter: string; unit: string; critical_low: string | null; warning_low: string | null;
  attention_low: string | null; attention_high: string | null;
  warning_high: string | null; critical_high: string | null;
}

const INITIAL: Threshold[] = [
  entry('do', 'mg/L', 'low', [3.5, 4.5, 5, null, null, null]),
  entry('ph', '', 'both', [7, 7.3, 7.5, 8.5, 8.7, 9]),
  entry('temperature', '°C', 'both', [24, 26, 26.5, 30.5, 31, 33]),
  entry('tds', 'mg/L', 'both', [null, 15000, 16000, 24000, 25000, null]),
  entry('turbidity', 'NTU', 'both', [null, 20, 25, 60, 80, null]),
  entry('water_level', 'cm', 'both', [105, 115, 120, 150, 155, null]),
  entry('tan', 'mg/L', 'high', [null, null, null, 1, 2, null]),
  entry('no2', 'mg/L', 'high', [null, null, null, 0.5, 1, null]),
  entry('vibrio', '×10³ CFU/mL', 'high', [null, null, null, 5, 10, null]),
  entry('alkalinity', 'mg/L', 'both', [null, 80, 100, 150, 180, null]),
];
const BY_PARAMETER = new Map(INITIAL.map((row) => [row.parameter, row]));

function entry(parameter: string, unit: string, sides: Sides, values: (number | null)[]): Threshold {
  return {
    parameter, unit, sides, criticalLow: values[0], warningLow: values[1],
    attentionLow: values[2], attentionHigh: values[3], warningHigh: values[4],
    criticalHigh: values[5],
  };
}

function fromRow(row: ValueRow): Threshold {
  const canonical = BY_PARAMETER.get(row.parameter);
  if (!canonical) throw new Error(`Unknown threshold parameter ${row.parameter}`);
  return entry(row.parameter, canonical.unit, canonical.sides, [
    row.critical_low, row.warning_low, row.attention_low,
    row.attention_high, row.warning_high, row.critical_high,
  ].map((value) => value === null ? null : Number(value)));
}

function parseItems(body: unknown): Threshold[] {
  const data = inputObject(body);
  const errors: { field: string; message: string }[] = [];
  if (!Array.isArray(data.items)) {
    throw new ApiProblem(422, 'validation_error', 'Invalid thresholds', {
      fieldErrors: [{ field: 'items', message: 'Must be an array' }],
    });
  }
  const seen = new Set<string>();
  const items: Threshold[] = [];
  data.items.forEach((value, index) => {
    const raw = typeof value === 'object' && value !== null && !Array.isArray(value)
      ? value as Record<string, unknown> : {};
    const parameter = raw.parameter;
    if (typeof parameter !== 'string' || !BY_PARAMETER.has(parameter)) {
      errors.push({ field: `items/${index}/parameter`, message: 'Unknown parameter' });
      return;
    }
    if (seen.has(parameter)) {
      errors.push({ field: `items/${index}/parameter`, message: 'Duplicate parameter' });
      return;
    }
    seen.add(parameter);
    const base = BY_PARAMETER.get(parameter)!;
    const next = { ...base };
    for (const field of BOUNDARIES) {
      const rawValue = raw[field];
      if (rawValue === undefined) {
        errors.push({ field: `${parameter}/${field}`, message: 'Boundary is required (null if unused)' });
      } else if (rawValue !== null && (typeof rawValue !== 'number' || !Number.isFinite(rawValue))) {
        errors.push({ field: `${parameter}/${field}`, message: 'Must be a number or null' });
      } else {
        next[field] = rawValue as number | null;
      }
    }
    if (base.sides === 'low') {
      next.attentionHigh = null; next.warningHigh = null; next.criticalHigh = null;
    }
    if (base.sides === 'high') {
      next.criticalLow = null; next.warningLow = null; next.attentionLow = null;
    }
    const low = ['criticalLow', 'warningLow', 'attentionLow'] as const;
    const high = ['attentionHigh', 'warningHigh', 'criticalHigh'] as const;
    for (const side of [low, high]) {
      let previous: number | null = null;
      for (const field of side) {
        const current = next[field];
        if (current !== null && previous !== null && current <= previous) {
          errors.push({ field: `${parameter}/${field}`, message: 'Boundaries are out of order' });
        }
        if (current !== null) previous = current;
      }
    }
    const innerLow = [next.attentionLow, next.warningLow, next.criticalLow].find((v) => v !== null);
    const innerHigh = [next.attentionHigh, next.warningHigh, next.criticalHigh].find((v) => v !== null);
    if (innerLow !== undefined && innerHigh !== undefined && innerHigh <= innerLow) {
      errors.push({ field: `${parameter}/attentionHigh`, message: 'High side must exceed low side' });
    }
    items.push(next);
  });
  if (errors.length) throw new ApiProblem(422, 'validation_error', 'Invalid thresholds', {
    fieldErrors: errors,
  });
  return items;
}

@Injectable()
export class AdminThresholdsService {
  constructor(private readonly postgres: PostgresService) {}

  async get(actor: UserScope, farmId?: string): Promise<{
    farmId: string | null; items: Threshold[];
    farms: { farm: { id: string; name: string }; parameters: string[] }[];
    updatedAt: string; updatedBy: { id: string; name: string };
  }> {
    const farmUuid = farmId ? await this.farmUuid(this.postgres.pool, actor.companyId, farmId) : null;
    await this.ensureDefaults(actor);
    const defaults = await this.currentSet(actor.companyId, null);
    if (!defaults) throw new Error('Missing threshold defaults');
    const own = farmUuid ? await this.currentSet(actor.companyId, farmUuid) : null;
    const defaultRows = await this.values(defaults.id);
    const ownRows = own ? await this.values(own.id) : [];
    const overrides = new Map(ownRows.map((row) => [row.parameter, fromRow(row)]));
    const items = defaultRows.map((row) => {
      const ownValue = overrides.get(row.parameter);
      return { ...(ownValue ?? fromRow(row)), ...(farmUuid ? { inherited: !ownValue } : {}) };
    });
    const farmsResult = await this.postgres.pool.query<{
      public_id: string; name: string; parameter: string | null;
    }>(
      `SELECT f.public_id, f.name, v.parameter FROM farms f
       LEFT JOIN threshold_sets s ON s.farm_id = f.id AND s.effective_to IS NULL
       LEFT JOIN threshold_values v ON v.set_id = s.id
       WHERE f.company_id = $1 ORDER BY lower(f.name), f.public_id, v.parameter`,
      [actor.companyId],
    );
    const farmMap = new Map<string, { farm: { id: string; name: string }; parameters: string[] }>();
    for (const row of farmsResult.rows) {
      let item = farmMap.get(row.public_id);
      if (!item) {
        item = { farm: { id: row.public_id, name: row.name }, parameters: [] };
        farmMap.set(row.public_id, item);
      }
      if (row.parameter) item.parameters.push(row.parameter);
    }
    const active = own ?? defaults;
    return { farmId: farmId ?? null, items, farms: [...farmMap.values()],
      updatedAt: active.updated_at.toISOString(),
      updatedBy: { id: active.updated_by_id, name: active.updated_by_name } };
  }

  async put(actor: UserScope, farmId: string | undefined, body: unknown): ReturnType<AdminThresholdsService['get']> {
    const items = parseItems(body);
    const farmUuid = farmId ? await this.farmUuid(this.postgres.pool, actor.companyId, farmId) : null;
    await this.ensureDefaults(actor);
    const client = await this.postgres.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT id FROM companies WHERE id = $1 FOR UPDATE', [actor.companyId]);
      const previous = await client.query<{ effective_to: Date }>(
        `UPDATE threshold_sets SET effective_to = clock_timestamp()
         WHERE company_id = $1 AND farm_id IS NOT DISTINCT FROM $2::uuid
           AND effective_to IS NULL RETURNING effective_to`,
        [actor.companyId, farmUuid],
      );
      if (items.length || farmUuid === null) {
        const inserted = await client.query<{ id: string }>(
          `INSERT INTO threshold_sets (company_id, farm_id, effective_from, updated_by)
           VALUES ($1, $2, $3, $4) RETURNING id`,
          [actor.companyId, farmUuid, previous.rows[0]?.effective_to ?? new Date(), actor.actorId],
        );
        const saved = farmUuid === null
          ? await this.mergeDefaults(client, previous.rows.length ? actor.companyId : null, items)
          : items;
        for (const item of saved) await this.insertValue(client, inserted.rows[0].id, item);
      }
      await client.query('COMMIT');
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
    return this.get(actor, farmId);
  }

  private async mergeDefaults(client: PoolClient, companyId: string | null, items: Threshold[]): Promise<Threshold[]> {
    const previous = companyId ? await client.query<ValueRow>(
      `SELECT v.* FROM threshold_values v
       WHERE v.set_id = (
         SELECT s.id FROM threshold_sets s
         WHERE s.company_id = $1 AND s.farm_id IS NULL AND s.effective_to IS NOT NULL
         ORDER BY s.effective_to DESC LIMIT 1
       )`, [companyId],
    ) : { rows: [] as ValueRow[] };
    const old = new Map(previous.rows.map((row) => [row.parameter, fromRow(row)]));
    const supplied = new Map(items.map((item) => [item.parameter, item]));
    return INITIAL.map((base) => supplied.get(base.parameter) ?? old.get(base.parameter) ?? base);
  }

  private async ensureDefaults(actor: UserScope): Promise<void> {
    const client = await this.postgres.pool.connect();
    try {
      await client.query('BEGIN');
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO threshold_sets (company_id, farm_id, effective_from, updated_by)
         VALUES ($1, NULL, clock_timestamp(), $2)
         ON CONFLICT DO NOTHING RETURNING id`, [actor.companyId, actor.actorId],
      );
      if (inserted.rows[0]) for (const item of INITIAL) {
        await this.insertValue(client, inserted.rows[0].id, item);
      }
      await client.query('COMMIT');
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }

  private async insertValue(client: PoolClient, setId: string, item: Threshold): Promise<void> {
    await client.query(
      `INSERT INTO threshold_values (set_id, parameter, unit, critical_low, warning_low,
         attention_low, attention_high, warning_high, critical_high)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [setId, item.parameter, item.unit, ...BOUNDARIES.map((field) => item[field])],
    );
  }

  private async values(setId: string): Promise<ValueRow[]> {
    const result = await this.postgres.pool.query<ValueRow>(
      'SELECT * FROM threshold_values WHERE set_id = $1', [setId],
    );
    const order = new Map(INITIAL.map((item, index) => [item.parameter, index]));
    return result.rows.sort((a, b) => (order.get(a.parameter) ?? 99) - (order.get(b.parameter) ?? 99));
  }

  private async currentSet(companyId: string, farmUuid: string | null): Promise<SetRow | null> {
    const result = await this.postgres.pool.query<SetRow>(
      `SELECT s.id, s.updated_at, u.public_id AS updated_by_id, u.name AS updated_by_name
       FROM threshold_sets s JOIN users u ON u.id = s.updated_by
       WHERE s.company_id = $1 AND s.farm_id IS NOT DISTINCT FROM $2::uuid
         AND s.effective_to IS NULL`, [companyId, farmUuid],
    );
    return result.rows[0] ?? null;
  }

  private async farmUuid(client: Pick<PoolClient, 'query'>, companyId: string, farmId: string): Promise<string> {
    const result = await client.query<{ id: string }>(
      'SELECT id FROM farms WHERE company_id = $1 AND public_id = $2', [companyId, farmId],
    );
    if (!result.rows[0]) throw new ApiProblem(404, 'not_found', 'Farm not found');
    return result.rows[0].id;
  }
}
