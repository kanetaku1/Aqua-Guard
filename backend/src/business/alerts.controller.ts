import { Body, Controller, Get, HttpCode, Param, Post, Query, Req } from '@nestjs/common';
import { AuthRequest, preferredLanguage, requirePrincipal } from '../auth/session.guard';
import { AlertsService } from './alerts.service';

@Controller('alerts')
export class AlertsController {
  constructor(private readonly alerts: AlertsService) {}

  @Get()
  list(@Req() request: AuthRequest, @Query() query: Record<string, unknown>) {
    return this.alerts.list(requirePrincipal(request), query, preferredLanguage(request));
  }

  @Get(':alertId')
  get(@Req() request: AuthRequest, @Param('alertId') alertId: string) {
    return this.alerts.get(requirePrincipal(request), alertId, preferredLanguage(request));
  }

  @Post(':alertId/acknowledge')
  @HttpCode(200)
  acknowledge(@Req() request: AuthRequest, @Param('alertId') alertId: string) {
    return this.alerts.acknowledge(requirePrincipal(request), alertId, preferredLanguage(request));
  }

  @Post(':alertId/actions')
  recordAction(@Req() request: AuthRequest, @Param('alertId') alertId: string,
    @Body() body: unknown) {
    return this.alerts.recordAction(requirePrincipal(request), alertId, body,
      preferredLanguage(request));
  }

  @Post(':alertId/resolve')
  @HttpCode(200)
  resolve(@Req() request: AuthRequest, @Param('alertId') alertId: string,
    @Body() body: unknown) {
    return this.alerts.resolve(requirePrincipal(request), alertId, body,
      preferredLanguage(request));
  }
}
