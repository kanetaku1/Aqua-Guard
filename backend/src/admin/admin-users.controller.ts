import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { AuthRequest } from '../auth/session.guard';
import { adminScope } from './admin-scope';
import { AdminUser, AdminUsersService } from './admin-users.service';

@Controller('admin/users')
export class AdminUsersController {
  constructor(private readonly users: AdminUsersService) {}

  @Get()
  list(
    @Req() request: AuthRequest, @Query() query: Record<string, string | undefined>,
  ): ReturnType<AdminUsersService['list']> {
    return this.users.list(adminScope(request), query);
  }

  @Post()
  invite(@Req() request: AuthRequest, @Body() body: unknown): Promise<AdminUser> {
    return this.users.invite(adminScope(request), body);
  }

  @Get(':userId')
  get(@Req() request: AuthRequest, @Param('userId') userId: string): Promise<AdminUser> {
    return this.users.get(adminScope(request), userId);
  }

  @Patch(':userId')
  update(
    @Req() request: AuthRequest, @Param('userId') userId: string, @Body() body: unknown,
  ): Promise<AdminUser> {
    return this.users.update(adminScope(request), userId, body);
  }

  @Post(':userId/resend-invitation')
  @HttpCode(202)
  resendInvitation(@Req() request: AuthRequest, @Param('userId') userId: string): Promise<void> {
    return this.users.resendInvitation(adminScope(request), userId);
  }

  @Post(':userId/send-password-reset')
  @HttpCode(202)
  sendPasswordReset(@Req() request: AuthRequest, @Param('userId') userId: string): Promise<void> {
    return this.users.sendPasswordReset(adminScope(request), userId);
  }

  @Post(':userId/deactivate')
  @HttpCode(200)
  deactivate(@Req() request: AuthRequest, @Param('userId') userId: string): Promise<AdminUser> {
    return this.users.deactivate(adminScope(request), userId);
  }

  @Post(':userId/reactivate')
  @HttpCode(200)
  reactivate(@Req() request: AuthRequest, @Param('userId') userId: string): Promise<AdminUser> {
    return this.users.reactivate(adminScope(request), userId);
  }
}
