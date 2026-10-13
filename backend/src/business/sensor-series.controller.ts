import { Controller, Get, Param, Query, Req } from '@nestjs/common';
import { AuthRequest, requirePrincipal } from '../auth/session.guard';
import { SensorSeriesService } from './sensor-series.service';

@Controller('ponds')
export class SensorSeriesController {
  constructor(private readonly series: SensorSeriesService) {}

  @Get(':pondId/sensors/series')
  get(@Req() request: AuthRequest, @Param('pondId') pondId: string,
    @Query() query: Record<string, unknown>) {
    return this.series.get(requirePrincipal(request), pondId, query);
  }
}
