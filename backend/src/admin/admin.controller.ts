import { Body, Controller, Get, Param, Patch, Post, Req } from '@nestjs/common';
import { AuthRequest } from '../auth/session.guard';
import { AdminFarm, AdminPond, AdminService } from './admin.service';
import { adminScope } from './admin-scope';

@Controller('admin')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('farms')
  listFarms(@Req() request: AuthRequest): Promise<{ items: AdminFarm[] }> {
    return this.admin.listFarms(adminScope(request).companyId);
  }

  @Post('farms')
  createFarm(@Req() request: AuthRequest, @Body() body: unknown): Promise<AdminFarm> {
    const actor = adminScope(request);
    return this.admin.createFarm(actor.companyId, actor.actorId, body);
  }

  @Get('farms/:farmId')
  getFarm(@Req() request: AuthRequest, @Param('farmId') farmId: string): Promise<AdminFarm> {
    return this.admin.getFarm(adminScope(request).companyId, farmId);
  }

  @Patch('farms/:farmId')
  updateFarm(
    @Req() request: AuthRequest, @Param('farmId') farmId: string, @Body() body: unknown,
  ): Promise<AdminFarm> {
    const actor = adminScope(request);
    return this.admin.updateFarm(actor.companyId, actor.actorId, farmId, body);
  }

  @Get('farms/:farmId/ponds')
  listPonds(
    @Req() request: AuthRequest, @Param('farmId') farmId: string,
  ): Promise<{ items: AdminPond[] }> {
    return this.admin.listPonds(adminScope(request).companyId, farmId);
  }

  @Post('farms/:farmId/ponds')
  createPond(
    @Req() request: AuthRequest, @Param('farmId') farmId: string, @Body() body: unknown,
  ): Promise<AdminPond> {
    return this.admin.createPond(adminScope(request).companyId, farmId, body);
  }

  @Patch('ponds/:pondId')
  updatePond(
    @Req() request: AuthRequest, @Param('pondId') pondId: string, @Body() body: unknown,
  ): Promise<AdminPond> {
    return this.admin.updatePond(adminScope(request).companyId, pondId, body);
  }
}
