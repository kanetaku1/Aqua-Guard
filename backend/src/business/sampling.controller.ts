import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { AuthRequest, requirePrincipal } from '../auth/session.guard';
import { SamplingService } from './sampling.service';

@Controller()
export class SamplingController {
  constructor(private readonly sampling: SamplingService) {}

  @Get('ponds/:pondId/samplings')
  pondList(@Req() request: AuthRequest, @Param('pondId') pondId: string) {
    return this.sampling.pondList(requirePrincipal(request), pondId);
  }

  @Post('ponds/:pondId/samplings')
  create(@Req() request: AuthRequest, @Param('pondId') pondId: string, @Body() body: unknown) {
    return this.sampling.create(requirePrincipal(request), pondId, body);
  }

  @Patch('samplings/:recordId')
  update(@Req() request: AuthRequest, @Param('recordId') recordId: string, @Body() body: unknown) {
    return this.sampling.update(requirePrincipal(request), recordId, body);
  }

  @Get('farms/:farmId/samplings')
  farmList(@Req() request: AuthRequest, @Param('farmId') farmId: string,
    @Query('date') date: unknown) {
    return this.sampling.farmList(requirePrincipal(request), farmId, date);
  }

  @Post('farms/:farmId/samplings/batch')
  @HttpCode(200)
  batch(@Req() request: AuthRequest, @Param('farmId') farmId: string, @Body() body: unknown) {
    return this.sampling.batch(requirePrincipal(request), farmId, body);
  }
}
