import { Controller, Get, Param, Req } from '@nestjs/common';
import { AuthRequest, requirePrincipal } from '../auth/session.guard';
import { PondWaterQualityService } from './pond-water-quality.service';

@Controller('farms')
export class PondWaterQualityController {
  constructor(private readonly waterQuality: PondWaterQualityService) {}

  @Get(':farmId/ponds/water-quality')
  list(@Req() request: AuthRequest, @Param('farmId') farmId: string) {
    return this.waterQuality.list(requirePrincipal(request), farmId);
  }
}
