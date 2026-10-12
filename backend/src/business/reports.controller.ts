import { Controller, Get, Query, Req } from '@nestjs/common';
import { AuthRequest, requirePrincipal } from '../auth/session.guard';
import { ReportsService } from './reports.service';

@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get()
  list(@Req() request: AuthRequest, @Query() query: Record<string, unknown>) {
    return this.reports.list(requirePrincipal(request), query);
  }
}
