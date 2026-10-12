import { Controller, Get, Param, Query, Req } from '@nestjs/common';
import { AuthRequest, requirePrincipal } from '../auth/session.guard';
import { FarmStatusService } from './farm-status.service';

@Controller('farms')
export class FarmStatusController {
  constructor(private readonly farms: FarmStatusService) {}

  @Get()
  list(@Req() request: AuthRequest, @Query() query: Record<string, unknown>) {
    return this.farms.list(requirePrincipal(request), query);
  }

  @Get(':farmId')
  detail(@Req() request: AuthRequest, @Param('farmId') farmId: string) {
    return this.farms.detail(requirePrincipal(request), farmId);
  }
}
