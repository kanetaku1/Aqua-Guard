import { Controller, Get, Param, Req } from '@nestjs/common';
import { AuthRequest, requirePrincipal } from '../auth/session.guard';
import { FarmReportStatusService } from './farm-report-status.service';

@Controller('farms')
export class FarmReportStatusController {
  constructor(private readonly reports: FarmReportStatusService) {}

  @Get(':farmId/report-status')
  get(@Req() request: AuthRequest, @Param('farmId') farmId: string) {
    return this.reports.get(requirePrincipal(request), farmId);
  }
}
