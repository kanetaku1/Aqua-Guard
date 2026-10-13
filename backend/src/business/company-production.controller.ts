import { Controller, Get, Req } from '@nestjs/common';
import { AuthRequest, requirePrincipal } from '../auth/session.guard';
import { CompanyProductionService } from './company-production.service';

@Controller('production')
export class CompanyProductionController {
  constructor(private readonly production: CompanyProductionService) {}

  @Get('summary')
  get(@Req() request: AuthRequest) {
    return this.production.get(requirePrincipal(request));
  }
}
