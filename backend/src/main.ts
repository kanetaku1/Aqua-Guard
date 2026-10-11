import 'reflect-metadata';
import { Logger, RequestMethod } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ProblemFilter } from './http/problem';
import { SensorIngestionService } from './infrastructure/sensor-ingestion.service';

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
  await app.listen(port, '0.0.0.0');
}

void bootstrap();
