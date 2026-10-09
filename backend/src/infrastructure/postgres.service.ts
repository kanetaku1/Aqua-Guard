import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Pool } from 'pg';
import { createPostgresPool } from './postgres';

@Injectable()
export class PostgresService implements OnModuleDestroy {
  readonly pool: Pool = createPostgresPool();

  async checkConnection(): Promise<void> {
    await this.pool.query('SELECT 1');
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}
