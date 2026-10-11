import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthController } from './auth/auth.controller';
import { AuthService } from './auth/auth.service';
import { SessionGuard } from './auth/session.guard';
import { AdminController } from './admin/admin.controller';
import { AdminService } from './admin/admin.service';
import { AdminUsersController } from './admin/admin-users.controller';
import { AdminUsersService } from './admin/admin-users.service';
import { AdminDevicesController } from './admin/admin-devices.controller';
import { AdminDevicesService } from './admin/admin-devices.service';
import { AdminSettingsController } from './admin/admin-settings.controller';
import { AdminSettingsService } from './admin/admin-settings.service';
import { MailService } from './auth/mail.service';
import { PasswordLinksService } from './auth/password-links.service';
import { HealthController } from './health.controller';
import { InfluxService } from './infrastructure/influx.service';
import { PostgresService } from './infrastructure/postgres.service';

@Module({
  controllers: [HealthController, AuthController, AdminController, AdminUsersController,
    AdminDevicesController, AdminSettingsController],
  providers: [PostgresService, InfluxService, AuthService, MailService, PasswordLinksService,
    AdminService, AdminUsersService, AdminDevicesService, AdminSettingsService,
    { provide: APP_GUARD, useClass: SessionGuard }],
})
export class AppModule {}
