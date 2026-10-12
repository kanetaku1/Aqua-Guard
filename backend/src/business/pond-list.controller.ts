import { Controller, Get, Param, Query, Req } from '@nestjs/common';
import { AuthRequest, requirePrincipal } from '../auth/session.guard';
import { PondListService } from './pond-list.service';

@Controller('farms')
export class PondListController {
  constructor(private readonly ponds: PondListService) {}

  @Get(':farmId/ponds')
  list(@Req() request: AuthRequest, @Param('farmId') farmId: string,
    @Query() query: Record<string, unknown>) {
    return this.ponds.list(requirePrincipal(request), farmId, query);
  }
}
