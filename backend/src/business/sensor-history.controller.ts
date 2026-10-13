import { Controller, Get, Param, Query, Req } from '@nestjs/common';
import { AuthRequest, requirePrincipal } from '../auth/session.guard';
import { SensorHistoryService } from './sensor-history.service';

@Controller('ponds')
export class SensorHistoryController {
  constructor(private readonly history: SensorHistoryService) {}

  @Get(':pondId/sensors/history')
  get(@Req() request: AuthRequest, @Param('pondId') pondId: string,
    @Query() query: Record<string, unknown>) {
    return this.history.get(requirePrincipal(request), pondId, query);
  }
}
