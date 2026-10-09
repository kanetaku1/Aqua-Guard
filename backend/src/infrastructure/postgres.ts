import { Pool } from 'pg';

export function createPostgresPool(): Pool {
  const connectionString = process.env.DATABASE_URL;
  if (connectionString) {
    return new Pool({ connectionString, max: 10, connectionTimeoutMillis: 5_000 });
  }

  const port = Number(process.env.POSTGRES_PORT ?? '5433');
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('POSTGRES_PORT must be an integer between 1 and 65535');
  }
  if (!process.env.POSTGRES_PASSWORD) {
    throw new Error('POSTGRES_PASSWORD or DATABASE_URL must be set');
  }

  return new Pool({
    host: process.env.POSTGRES_HOST ?? '127.0.0.1',
    port,
    user: process.env.POSTGRES_USER ?? 'aquaguard',
    password: process.env.POSTGRES_PASSWORD,
    database: process.env.POSTGRES_DB ?? 'aquaguard',
    max: 10,
    connectionTimeoutMillis: 5_000,
  });
}
