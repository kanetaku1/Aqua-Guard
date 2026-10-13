import { Controller, Get, Req } from '@nestjs/common';
import { AuthRequest, requirePrincipal } from '../auth/session.guard';
import { SyncStatusService } from './sync-status.service';

@Controller('sync-status')
export class SyncStatusController {
  constructor(private readonly status: SyncStatusService) {}

  @Get()
  get(@Req() request: AuthRequest) {
    return this.status.get(requirePrincipal(request));
  }
}
