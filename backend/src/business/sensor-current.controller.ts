import { Controller, Get, Param, Req } from '@nestjs/common';
import { AuthRequest, requirePrincipal } from '../auth/session.guard';
import { SensorCurrentService } from './sensor-current.service';

@Controller('ponds')
export class SensorCurrentController {
  constructor(private readonly current: SensorCurrentService) {}

  @Get(':pondId/sensors/current')
  get(@Req() request: AuthRequest, @Param('pondId') pondId: string) {
    return this.current.get(requirePrincipal(request), pondId);
  }
}
