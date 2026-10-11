import { Body, Controller, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { AuthRequest, requirePrincipal } from '../auth/session.guard';
import { FeedingService } from './feeding.service';

@Controller()
export class FeedingController {
  constructor(private readonly feeding: FeedingService) {}

  @Get('ponds/:pondId/feedings')
  list(@Req() request: AuthRequest, @Param('pondId') pondId: string,
    @Query() query: Record<string, unknown>) {
    return this.feeding.list(requirePrincipal(request), pondId, query);
  }

  @Post('ponds/:pondId/feedings')
  create(@Req() request: AuthRequest, @Param('pondId') pondId: string,
    @Body() body: unknown) {
    return this.feeding.create(requirePrincipal(request), pondId, body);
  }

  @Patch('feedings/:recordId')
  update(@Req() request: AuthRequest, @Param('recordId') recordId: string,
    @Body() body: unknown) {
    return this.feeding.update(requirePrincipal(request), recordId, body);
  }
}
