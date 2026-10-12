import { Body, Controller, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { AuthRequest, preferredLanguage, requirePrincipal } from '../auth/session.guard';
import { ReportsService } from './reports.service';
import { DailyReportViewService } from './daily-report-view.service';
import { DailyReportCreateService } from './daily-report-create.service';
import { DailyReportUpdateService } from './daily-report-update.service';
import { ReportSubmitService } from './report-submit.service';
import { WeeklyReportViewService } from './weekly-report-view.service';
import { WeeklyReportCreateService } from './weekly-report-create.service';
import { WeeklyReportUpdateService } from './weekly-report-update.service';

@Controller('reports')
export class ReportsController {
  constructor(
    private readonly reports: ReportsService,
    private readonly daily: DailyReportViewService,
    private readonly dailyCreate: DailyReportCreateService,
    private readonly dailyUpdate: DailyReportUpdateService,
    private readonly submitService: ReportSubmitService,
    private readonly weekly: WeeklyReportViewService,
    private readonly weeklyCreate: WeeklyReportCreateService,
    private readonly weeklyUpdate: WeeklyReportUpdateService,
  ) {}

  @Get()
  list(@Req() request: AuthRequest, @Query() query: Record<string, unknown>) {
    return this.reports.list(requirePrincipal(request), query);
  }

  @Get('daily/:reportId')
  getDaily(@Req() request: AuthRequest, @Param('reportId') reportId: string) {
    return this.daily.get(requirePrincipal(request), reportId, preferredLanguage(request));
  }

  @Get('weekly/:reportId')
  getWeekly(@Req() request: AuthRequest, @Param('reportId') reportId: string) {
    return this.weekly.get(requirePrincipal(request), reportId,
      preferredLanguage(request));
  }

  @Post('weekly')
  createWeekly(@Req() request: AuthRequest, @Body() body: unknown) {
    return this.weeklyCreate.create(requirePrincipal(request), body,
      preferredLanguage(request));
  }

  @Post('daily')
  createDaily(@Req() request: AuthRequest, @Body() body: unknown) {
    return this.dailyCreate.create(requirePrincipal(request), body,
      preferredLanguage(request));
  }

  @Patch('weekly/:reportId')
  updateWeekly(@Req() request: AuthRequest, @Param('reportId') reportId: string,
    @Body() body: unknown) {
    return this.weeklyUpdate.update(requirePrincipal(request), reportId, body,
      preferredLanguage(request));
  }

  @Patch('daily/:reportId')
  updateDaily(@Req() request: AuthRequest, @Param('reportId') reportId: string,
    @Body() body: unknown) {
    return this.dailyUpdate.update(requirePrincipal(request), reportId, body,
      preferredLanguage(request));
  }

  @Post(':reportId/submit')
  submit(@Req() request: AuthRequest, @Param('reportId') reportId: string) {
    return this.submitService.submit(requirePrincipal(request), reportId,
      preferredLanguage(request));
  }
}
