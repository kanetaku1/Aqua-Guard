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
import { SensorHistoryController } from './business/sensor-history.controller';
import { SensorHistoryService } from './business/sensor-history.service';
import { SensorAnomaliesController } from './business/sensor-anomalies.controller';
import { SensorAnomaliesService } from './business/sensor-anomalies.service';
import { AlertsController } from './business/alerts.controller';
import { AlertsService } from './business/alerts.service';
import { IssuesController } from './business/issues.controller';
import { IssuesService } from './business/issues.service';
import { MortalityController } from './business/mortality.controller';
import { MortalityService } from './business/mortality.service';
import { FeedingController } from './business/feeding.controller';
import { FeedingService } from './business/feeding.service';
import { SamplingController } from './business/sampling.controller';
import { SamplingService } from './business/sampling.service';
import { MailService } from './auth/mail.service';
import { PasswordLinksService } from './auth/password-links.service';
import { HealthController } from './health.controller';
import { InfluxService } from './infrastructure/influx.service';
import { SensorIngestionService } from './infrastructure/sensor-ingestion.service';
import { CriticalEvaluationService } from './infrastructure/critical-evaluation.service';
import { PeriodicAlertService } from './infrastructure/periodic-alert.service';
import { PostgresService } from './infrastructure/postgres.service';

@Module({
  controllers: [HealthController, AuthController, AdminController, AdminUsersController,
    AdminDevicesController, AdminSettingsController, SyncStatusController,
    SensorSeriesController, SensorCurrentController, SensorHistoryController,
    SensorAnomaliesController,
    AlertsController,
    IssuesController,
    MortalityController, FeedingController,
    SamplingController],
  providers: [PostgresService, InfluxService, SensorIngestionService,
    CriticalEvaluationService,
    PeriodicAlertService,
    AuthService, MailService, PasswordLinksService,
    AdminService, AdminUsersService, AdminDevicesService, AdminSettingsService,
    AdminThresholdsService, BusinessScopeService, SyncStatusService, SensorSeriesService,
    SensorCurrentService, SensorHistoryService, SensorAnomaliesService,
    AlertsService,
    IssuesService,
    MortalityService, FeedingService, SamplingService,
    { provide: APP_GUARD, useClass: SessionGuard }],
})
export class AppModule {}
