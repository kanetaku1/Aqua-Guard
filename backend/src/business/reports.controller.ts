import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import { AuthRequest, preferredLanguage, requirePrincipal } from '../auth/session.guard';
import { ReportsService } from './reports.service';
import { DailyReportViewService } from './daily-report-view.service';
import { DailyReportCreateService } from './daily-report-create.service';

@Controller('reports')
export class ReportsController {
  constructor(
    private readonly reports: ReportsService,
    private readonly daily: DailyReportViewService,
    private readonly dailyCreate: DailyReportCreateService,
  ) {}

  @Get()
  list(@Req() request: AuthRequest, @Query() query: Record<string, unknown>) {
    return this.reports.list(requirePrincipal(request), query);
  }

  @Get('daily/:reportId')
  getDaily(@Req() request: AuthRequest, @Param('reportId') reportId: string) {
    return this.daily.get(requirePrincipal(request), reportId, preferredLanguage(request));
  }

  @Post('daily')
  createDaily(@Req() request: AuthRequest, @Body() body: unknown) {
    return this.dailyCreate.create(requirePrincipal(request), body,
      preferredLanguage(request));
  }
}
