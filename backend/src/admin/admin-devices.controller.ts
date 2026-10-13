import { Body, Controller, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { AuthRequest } from '../auth/session.guard';
import { adminScope } from './admin-scope';
import { AdminDevice, AdminDevicesService } from './admin-devices.service';

@Controller('admin')
export class AdminDevicesController {
  constructor(private readonly devices: AdminDevicesService) {}

  @Get('farms/:farmId/devices')
  list(@Req() request: AuthRequest, @Param('farmId') farmId: string, @Query() query: Record<string, unknown>) {
    return this.devices.list(adminScope(request).companyId, farmId, query);
  }

  @Post('farms/:farmId/devices')
  create(@Req() request: AuthRequest, @Param('farmId') farmId: string, @Body() body: unknown): Promise<AdminDevice> {
    return this.devices.create(adminScope(request).companyId, farmId, body);
  }

  @Patch('devices/:deviceId')
  update(@Req() request: AuthRequest, @Param('deviceId') deviceId: string, @Body() body: unknown): Promise<AdminDevice> {
    return this.devices.update(adminScope(request).companyId, deviceId, body);
  }
}
