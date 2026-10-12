import { Controller, Get, Param, Req } from '@nestjs/common';
import { AuthRequest, requirePrincipal } from '../auth/session.guard';
import { PondDetailService } from './pond-detail.service';

@Controller('ponds')
export class PondDetailController {
  constructor(private readonly detail: PondDetailService) {}

  @Get(':pondId')
  get(@Req() request: AuthRequest, @Param('pondId') pondId: string) {
    return this.detail.get(requirePrincipal(request), pondId);
  }
}
