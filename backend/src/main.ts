import 'reflect-metadata';
import { Logger, RequestMethod } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ProblemFilter } from './http/problem';
import { SensorIngestionService } from './infrastructure/sensor-ingestion.service';
import { CriticalEvaluationService } from './infrastructure/critical-evaluation.service';
import { PeriodicAlertService } from './infrastructure/periodic-alert.service';

async function bootstrap(): Promise<void> {
  const port = Number(process.env.PORT ?? '8000');
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535');
  }

  const app = await NestFactory.create(AppModule);
  app.enableCsrfProtection();
  app.useGlobalFilters(new ProblemFilter());
  app.setGlobalPrefix('api/v1', {
    exclude: [
      { path: 'health', method: RequestMethod.GET },
      { path: 'health/ready', method: RequestMethod.GET },
    ],
  });
  try {
    const result = await app.get(SensorIngestionService).recoverPendingFromStorage();
    if (result.recovered || result.missing || result.quarantined) {
      new Logger('SensorRecovery').log(JSON.stringify(result));
    }
  } catch (error) {
    new Logger('SensorRecovery').error('Pending receipt recovery failed', error);
  }
  try {
    const result = await app.get(CriticalEvaluationService).recoverUnevaluated();
    if (result.evaluated || result.skipped || result.failed) {
      new Logger('CriticalRecovery').log(JSON.stringify(result));
    }
  } catch (error) {
    new Logger('CriticalRecovery').error('Critical receipt recovery failed', error);
  }
  await app.listen(port, '0.0.0.0');
  try {
    const result = await app.get(PeriodicAlertService).runOnce();
    if (result.points) new Logger('PeriodicAlerts').log(JSON.stringify(result));
  } catch (error) {
    new Logger('PeriodicAlerts').error('Initial periodic alert scan failed', error);
  }
  let recoveryRunning = false;
  const recoveryTimer = setInterval(async () => {
    if (recoveryRunning) return;
    recoveryRunning = true;
    try {
      const result = await app.get(CriticalEvaluationService).recoverUnevaluated();
      if (result.evaluated || result.skipped || result.failed) {
        new Logger('CriticalRecovery').log(JSON.stringify(result));
      }
    } catch (error) {
      new Logger('CriticalRecovery').error('Critical retry failed', error);
    } finally { recoveryRunning = false; }
  }, 60_000);
  recoveryTimer.unref();
  let periodicRunning = false;
  const periodicTimer = setInterval(async () => {
    if (periodicRunning) return;
    periodicRunning = true;
    try {
      const result = await app.get(PeriodicAlertService).runOnce();
      if (result.points) new Logger('PeriodicAlerts').log(JSON.stringify(result));
    } catch (error) {
      new Logger('PeriodicAlerts').error('Periodic alert scan failed', error);
    } finally { periodicRunning = false; }
  }, 5 * 60_000);
  periodicTimer.unref();
}

void bootstrap();
