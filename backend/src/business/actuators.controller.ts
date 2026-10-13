import { Body, Controller, Get, HttpCode, Param, Post, Query, Req } from '@nestjs/common';
import { AuthRequest, requirePrincipal } from '../auth/session.guard';
import { ActuatorsService } from './actuators.service';

@Controller()
export class ActuatorsController {
  constructor(private readonly actuators: ActuatorsService) {}

  @Get('ponds/:pondId/actuators')
  list(@Req() request: AuthRequest, @Param('pondId') pondId: string) {
    return this.actuators.list(requirePrincipal(request), pondId);
  }

  @Post('actuators/:actuatorId/commands')
  @HttpCode(202)
  command(@Req() request: AuthRequest, @Param('actuatorId') actuatorId: string,
    @Body() body: unknown) {
    return this.actuators.command(requirePrincipal(request), actuatorId, body);
  }

  @Get('ponds/:pondId/actuator-logs')
  logs(@Req() request: AuthRequest, @Param('pondId') pondId: string,
    @Query() query: Record<string, unknown>) {
    return this.actuators.logs(requirePrincipal(request), pondId, query);
  }
}
