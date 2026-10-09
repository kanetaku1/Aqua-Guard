import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthController } from './auth/auth.controller';
import { AuthService } from './auth/auth.service';
import { SessionGuard } from './auth/session.guard';
import { AdminController } from './admin/admin.controller';
import { AdminService } from './admin/admin.service';
import { AdminUsersController } from './admin/admin-users.controller';
import { AdminUsersService } from './admin/admin-users.service';
import { HealthController } from './health.controller';
import { InfluxService } from './infrastructure/influx.service';
import { PostgresService } from './infrastructure/postgres.service';

@Module({
  controllers: [HealthController, AuthController, AdminController, AdminUsersController],
  providers: [PostgresService, InfluxService, AuthService, AdminService, AdminUsersService,
    { provide: APP_GUARD, useClass: SessionGuard }],
})
export class AppModule {}
