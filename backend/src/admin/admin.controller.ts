import { Body, Controller, Get, Param, Patch, Post, Req } from '@nestjs/common';
import { AuthRequest, requirePrincipal } from '../auth/session.guard';
import { ApiProblem } from '../http/problem';
import { AdminFarm, AdminPond, AdminService } from './admin.service';

function scope(request: AuthRequest): { companyId: string; actorId: string } {
  const principal = requirePrincipal(request);
  if (principal.role !== 'system_administrator') {
    throw new ApiProblem(403, 'forbidden', 'Administrator access required');
  }
  return { companyId: principal.companyId, actorId: principal.userId };
}

@Controller('admin')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('farms')
  listFarms(@Req() request: AuthRequest): Promise<{ items: AdminFarm[] }> {
    return this.admin.listFarms(scope(request).companyId);
  }

  @Post('farms')
  createFarm(@Req() request: AuthRequest, @Body() body: unknown): Promise<AdminFarm> {
    const actor = scope(request);
    return this.admin.createFarm(actor.companyId, actor.actorId, body);
  }

  @Get('farms/:farmId')
  getFarm(@Req() request: AuthRequest, @Param('farmId') farmId: string): Promise<AdminFarm> {
    return this.admin.getFarm(scope(request).companyId, farmId);
  }

  @Patch('farms/:farmId')
  updateFarm(
    @Req() request: AuthRequest, @Param('farmId') farmId: string, @Body() body: unknown,
  ): Promise<AdminFarm> {
    const actor = scope(request);
    return this.admin.updateFarm(actor.companyId, actor.actorId, farmId, body);
  }

  @Get('farms/:farmId/ponds')
  listPonds(
    @Req() request: AuthRequest, @Param('farmId') farmId: string,
  ): Promise<{ items: AdminPond[] }> {
    return this.admin.listPonds(scope(request).companyId, farmId);
  }

  @Post('farms/:farmId/ponds')
  createPond(
    @Req() request: AuthRequest, @Param('farmId') farmId: string, @Body() body: unknown,
  ): Promise<AdminPond> {
    return this.admin.createPond(scope(request).companyId, farmId, body);
  }

  @Patch('ponds/:pondId')
  updatePond(
    @Req() request: AuthRequest, @Param('pondId') pondId: string, @Body() body: unknown,
  ): Promise<AdminPond> {
    return this.admin.updatePond(scope(request).companyId, pondId, body);
  }
}
