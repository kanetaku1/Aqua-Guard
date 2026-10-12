import { Controller, Get, Param, Query, Req } from '@nestjs/common';
import { AuthRequest, preferredLanguage, requirePrincipal } from '../auth/session.guard';
import { ReportsService } from './reports.service';
import { DailyReportViewService } from './daily-report-view.service';

@Controller('reports')
export class ReportsController {
  constructor(
    private readonly reports: ReportsService,
    private readonly daily: DailyReportViewService,
  ) {}

  @Get()
  list(@Req() request: AuthRequest, @Query() query: Record<string, unknown>) {
    return this.reports.list(requirePrincipal(request), query);
  }

  @Get('daily/:reportId')
  getDaily(@Req() request: AuthRequest, @Param('reportId') reportId: string) {
    return this.daily.get(requirePrincipal(request), reportId, preferredLanguage(request));
  }
}
