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
import { PondWaterQualityController } from './business/pond-water-quality.controller';
import { PondWaterQualityService } from './business/pond-water-quality.service';
import { PondPlanningService } from './business/pond-planning.service';
import { PondDetailController } from './business/pond-detail.controller';
import { PondDetailService } from './business/pond-detail.service';
import { PondListController } from './business/pond-list.controller';
import { PondListService } from './business/pond-list.service';
import { FarmGrowthStatusService } from './business/farm-growth-status.service';
import { FarmProductionController } from './business/farm-production.controller';
import { FarmProductionService } from './business/farm-production.service';
import { CompanyProductionController } from './business/company-production.controller';
import { CompanyProductionService } from './business/company-production.service';
import { FarmStatusController } from './business/farm-status.controller';
import { FarmStatusService } from './business/farm-status.service';
import { FarmDeviceStatusService } from './business/farm-device-status.service';
import { FarmOperationalStatusController } from './business/farm-operational-status.controller';
import { FarmOperationalStatusService } from './business/farm-operational-status.service';
import { FarmReportStatusController } from './business/farm-report-status.controller';
import { FarmReportStatusService } from './business/farm-report-status.service';
import { ReportsController } from './business/reports.controller';
import { ReportsService } from './business/reports.service';
import { DailyReportRecordsService } from './business/daily-report-records.service';
import { DailyReportPondsService } from './business/daily-report-ponds.service';
import { DailyReportActivityService } from './business/daily-report-activity.service';
import { DailyReportEquipmentService } from './business/daily-report-equipment.service';
import { DailyReportViewService } from './business/daily-report-view.service';
import { DailyReportCreateService } from './business/daily-report-create.service';
import { DailyReportUpdateService } from './business/daily-report-update.service';
import { DailyReportSubmitService } from './business/daily-report-submit.service';
import { WeeklyReportTotalsService } from './business/weekly-report-totals.service';
import { WeeklySamplingCoverageService } from './business/weekly-sampling-coverage.service';
import { WeeklyReportActivityService } from './business/weekly-report-activity.service';
import { WeeklyWaterQualityService } from './business/weekly-water-quality.service';
import { WeeklyLaboratoryService } from './business/weekly-laboratory.service';
import { WeeklyReportViewService } from './business/weekly-report-view.service';
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
import { MqttTelemetrySubscriberService } from './infrastructure/mqtt-telemetry-subscriber.service';
import { DeviceTelemetryIngestionService } from './infrastructure/device-telemetry-ingestion.service';
import { CriticalEvaluationService } from './infrastructure/critical-evaluation.service';
import { PeriodicAlertService } from './infrastructure/periodic-alert.service';
import { AlertNotificationMaterializerService } from './infrastructure/alert-notification-materializer.service';
import { PostgresService } from './infrastructure/postgres.service';

@Module({
  controllers: [HealthController, AuthController, AdminController, AdminUsersController,
    AdminDevicesController, AdminSettingsController, SyncStatusController,
    SensorSeriesController, SensorCurrentController, PondWaterQualityController,
    PondDetailController, PondListController, FarmOperationalStatusController,
    FarmProductionController,
    CompanyProductionController,
    FarmStatusController,
    FarmReportStatusController, ReportsController,
    SensorHistoryController,
    SensorAnomaliesController,
    AlertsController,
    IssuesController,
    MortalityController, FeedingController,
    SamplingController],
  providers: [PostgresService, InfluxService, SensorIngestionService,
    MqttTelemetrySubscriberService, DeviceTelemetryIngestionService,
    CriticalEvaluationService,
    PeriodicAlertService,
    AlertNotificationMaterializerService,
    AuthService, MailService, PasswordLinksService,
    AdminService, AdminUsersService, AdminDevicesService, AdminSettingsService,
    AdminThresholdsService, BusinessScopeService, SyncStatusService, SensorSeriesService,
    SensorCurrentService, PondWaterQualityService, PondPlanningService,
    PondDetailService, PondListService, FarmGrowthStatusService,
    FarmProductionService,
    CompanyProductionService,
    FarmStatusService,
    FarmDeviceStatusService, FarmOperationalStatusService, FarmReportStatusService,
    ReportsService, DailyReportRecordsService, DailyReportPondsService,
    DailyReportActivityService, DailyReportEquipmentService, DailyReportViewService,
    DailyReportCreateService, DailyReportUpdateService, DailyReportSubmitService,
    WeeklyReportTotalsService, WeeklySamplingCoverageService,
    WeeklyReportActivityService,
    WeeklyWaterQualityService,
    WeeklyLaboratoryService,
    WeeklyReportViewService,
    SensorHistoryService,
    SensorAnomaliesService,
    AlertsService,
    IssuesService,
    MortalityService, FeedingService, SamplingService,
    { provide: APP_GUARD, useClass: SessionGuard }],
})
export class AppModule {}
