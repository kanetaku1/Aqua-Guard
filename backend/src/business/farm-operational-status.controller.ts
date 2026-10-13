import { Controller, Get, Param, Req } from '@nestjs/common';
import { AuthRequest, requirePrincipal } from '../auth/session.guard';
import { FarmOperationalStatusService } from './farm-operational-status.service';

@Controller('farms')
export class FarmOperationalStatusController {
  constructor(private readonly operations: FarmOperationalStatusService) {}

  @Get(':farmId/operational-status')
  get(@Req() request: AuthRequest, @Param('farmId') farmId: string) {
    return this.operations.get(requirePrincipal(request), farmId);
  }
}
