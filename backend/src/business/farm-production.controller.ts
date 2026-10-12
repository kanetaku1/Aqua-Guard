import { Controller, Get, Param, Query, Req } from '@nestjs/common';
import { AuthRequest, requirePrincipal } from '../auth/session.guard';
import { FarmProductionService } from './farm-production.service';

@Controller('farms')
export class FarmProductionController {
  constructor(private readonly production: FarmProductionService) {}

  @Get(':farmId/production')
  get(@Req() request: AuthRequest, @Param('farmId') farmId: string,
    @Query('samplingDate') samplingDate?: string) {
    return this.production.get(requirePrincipal(request), farmId, samplingDate);
  }
}
