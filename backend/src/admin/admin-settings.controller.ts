import { Body, Controller, Get, Put, Query, Req } from '@nestjs/common';
import { AuthRequest } from '../auth/session.guard';
import { adminScope } from './admin-scope';
import { AdminSettingsService } from './admin-settings.service';
import { AdminThresholdsService } from './admin-thresholds.service';

@Controller('admin/settings')
export class AdminSettingsController {
  constructor(private readonly settings: AdminSettingsService,
    private readonly thresholds: AdminThresholdsService) {}

  @Get('thresholds')
  getThresholds(@Req() request: AuthRequest, @Query('farmId') farmId?: string) {
    return this.thresholds.get(adminScope(request), farmId);
  }

  @Put('thresholds')
  putThresholds(@Req() request: AuthRequest, @Query('farmId') farmId: string | undefined,
    @Body() body: unknown) {
    return this.thresholds.put(adminScope(request), farmId, body);
  }

  @Get('growth-targets')
  getGrowth(@Req() request: AuthRequest) { return this.settings.getGrowth(adminScope(request)); }

  @Put('growth-targets')
  putGrowth(@Req() request: AuthRequest, @Body() body: unknown) {
    return this.settings.putGrowth(adminScope(request), body);
  }

  @Get('rules')
  getRules(@Req() request: AuthRequest) { return this.settings.getRules(adminScope(request)); }

  @Put('rules')
  putRules(@Req() request: AuthRequest, @Body() body: unknown) {
    return this.settings.putRules(adminScope(request), body);
  }
}
