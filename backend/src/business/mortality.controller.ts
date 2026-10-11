import { Body, Controller, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { AuthRequest, requirePrincipal } from '../auth/session.guard';
import { MortalityService } from './mortality.service';

@Controller()
export class MortalityController {
  constructor(private readonly mortality: MortalityService) {}

  @Get('ponds/:pondId/mortalities')
  list(@Req() request: AuthRequest, @Param('pondId') pondId: string,
    @Query() query: Record<string, unknown>) {
    return this.mortality.list(requirePrincipal(request), pondId, query);
  }

  @Post('ponds/:pondId/mortalities')
  create(@Req() request: AuthRequest, @Param('pondId') pondId: string,
    @Body() body: unknown) {
    return this.mortality.create(requirePrincipal(request), pondId, body);
  }

  @Patch('mortalities/:recordId')
  update(@Req() request: AuthRequest, @Param('recordId') recordId: string,
    @Body() body: unknown) {
    return this.mortality.update(requirePrincipal(request), recordId, body);
  }
}
