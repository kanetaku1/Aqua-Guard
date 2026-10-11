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
import { AdminThresholdsService } from './admin/admin-thresholds.service';
import { BusinessScopeService } from './business/business-scope.service';
import { SyncStatusController } from './business/sync-status.controller';
import { SyncStatusService } from './business/sync-status.service';
import { SensorSeriesController } from './business/sensor-series.controller';
import { SensorSeriesService } from './business/sensor-series.service';
import { SensorCurrentController } from './business/sensor-current.controller';
import { SensorCurrentService } from './business/sensor-current.service';
import { MortalityController } from './business/mortality.controller';
import { MortalityService } from './business/mortality.service';
import { MailService } from './auth/mail.service';
import { PasswordLinksService } from './auth/password-links.service';
import { HealthController } from './health.controller';
import { InfluxService } from './infrastructure/influx.service';
import { SensorIngestionService } from './infrastructure/sensor-ingestion.service';
import { PostgresService } from './infrastructure/postgres.service';

@Module({
  controllers: [HealthController, AuthController, AdminController, AdminUsersController,
    AdminDevicesController, AdminSettingsController, SyncStatusController,
    SensorSeriesController, SensorCurrentController, MortalityController],
  providers: [PostgresService, InfluxService, SensorIngestionService,
    AuthService, MailService, PasswordLinksService,
    AdminService, AdminUsersService, AdminDevicesService, AdminSettingsService,
    AdminThresholdsService, BusinessScopeService, SyncStatusService, SensorSeriesService,
    SensorCurrentService, MortalityService,
    { provide: APP_GUARD, useClass: SessionGuard }],
})
export class AppModule {}
