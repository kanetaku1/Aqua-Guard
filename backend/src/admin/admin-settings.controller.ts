import { Body, Controller, Get, Put, Req } from '@nestjs/common';
import { AuthRequest } from '../auth/session.guard';
import { adminScope } from './admin-scope';
import { AdminSettingsService } from './admin-settings.service';

@Controller('admin/settings')
export class AdminSettingsController {
  constructor(private readonly settings: AdminSettingsService) {}

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
