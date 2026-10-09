import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { InfluxService } from './infrastructure/influx.service';
import { PostgresService } from './infrastructure/postgres.service';

@Controller('health')
export class HealthController {
  constructor(
    private readonly postgres: PostgresService,
    private readonly influx: InfluxService,
  ) {}

  @Get()
  getHealth(): { status: 'ok' } {
    return { status: 'ok' };
  }

  @Get('ready')
  async getReadiness(): Promise<{ status: 'ok' }> {
    try {
      await Promise.all([this.postgres.checkConnection(), this.influx.checkConnection()]);
      return { status: 'ok' };
    } catch {
      throw new ServiceUnavailableException('Data services are unavailable');
    }
  }
}
