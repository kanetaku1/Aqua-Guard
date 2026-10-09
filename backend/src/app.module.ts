import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { InfluxService } from './infrastructure/influx.service';
import { PostgresService } from './infrastructure/postgres.service';

@Module({
  controllers: [HealthController],
  providers: [PostgresService, InfluxService],
})
export class AppModule {}
