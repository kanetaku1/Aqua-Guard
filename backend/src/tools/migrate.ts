import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { PoolClient } from 'pg';
import { createPostgresPool } from '../infrastructure/postgres';

async function migrate(): Promise<void> {
  const pool = createPostgresPool();
  let client: PoolClient | undefined;
  let locked = false;
  const directory = resolve(__dirname, '../../migrations');

  try {
    client = await pool.connect();
    await client.query('SELECT pg_advisory_lock(5135274735168023)');
    locked = true;
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename text PRIMARY KEY,
        checksum text NOT NULL,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    const files = (await readdir(directory)).filter((name) => /^\d+_.*\.sql$/.test(name)).sort();
    if (files.length === 0) {
      throw new Error(`No migration SQL files found in ${directory}`);
    }
    let appliedCount = 0;
    for (const filename of files) {
      const sql = await readFile(resolve(directory, filename), 'utf8');
      const checksum = createHash('sha256').update(sql).digest('hex');
      const applied = await client.query<{ checksum: string }>(
        'SELECT checksum FROM schema_migrations WHERE filename = $1',
        [filename],
      );
      if (applied.rowCount) {
        if (applied.rows[0].checksum !== checksum) {
          throw new Error(`Applied migration has changed: ${filename}`);
        }
        continue;
      }

      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query(
          'INSERT INTO schema_migrations (filename, checksum) VALUES ($1, $2)',
          [filename, checksum],
        );
        await client.query('COMMIT');
        console.log(`Applied ${filename}`);
        appliedCount += 1;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }
    if (appliedCount === 0) console.log('No pending migrations');
  } finally {
    try {
      if (locked && client) await client.query('SELECT pg_advisory_unlock(5135274735168023)');
    } finally {
      client?.release();
      await pool.end();
    }
  }
}

void migrate().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
