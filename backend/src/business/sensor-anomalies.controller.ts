import { Controller, Get, Param, Query, Req } from '@nestjs/common';
import { AuthRequest, requirePrincipal } from '../auth/session.guard';
import { SensorAnomaliesService } from './sensor-anomalies.service';

@Controller('ponds')
export class SensorAnomaliesController {
  constructor(private readonly anomalies: SensorAnomaliesService) {}

  @Get(':pondId/sensors/anomalies')
  list(@Req() request: AuthRequest, @Param('pondId') pondId: string,
    @Query() query: Record<string, unknown>) {
    return this.anomalies.list(requirePrincipal(request), pondId, query);
  }
}
