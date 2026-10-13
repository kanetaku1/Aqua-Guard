import {
  Body, Controller, Get, HttpCode, Param, Patch, Post, Req, Res,
} from '@nestjs/common';
import { AuthRequest, Public, preferredLanguage, requirePrincipal } from './session.guard';
import { AuthService, Me } from './auth.service';
import { ApiProblem } from '../http/problem';
import { PasswordLinksService, PasswordTokenInfo } from './password-links.service';

interface CookieResponse {
  cookie(name: string, value: string, options: Record<string, unknown>): void;
  clearCookie(name: string, options: Record<string, unknown>): void;
}

const COOKIE_NAME = 'aquaguard_session';
const COOKIE_PATH = '/api/v1';
const COOKIE_SECURE = process.env.COOKIE_SECURE === 'true' || process.env.NODE_ENV === 'production';

function cookieOptions(): Record<string, unknown> {
  return { httpOnly: true, secure: COOKIE_SECURE, sameSite: 'lax', path: COOKIE_PATH };
}

function bodyRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ApiProblem(422, 'validation_error', 'Invalid request body');
  }
  return value as Record<string, unknown>;
}

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly links: PasswordLinksService,
  ) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  async login(
    @Body() body: unknown, @Req() request: AuthRequest,
    @Res({ passthrough: true }) response: CookieResponse,
  ): Promise<Me> {
    const data = bodyRecord(body);
    if (typeof data.email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)
      || typeof data.password !== 'string' || !data.password) {
      throw new ApiProblem(422, 'validation_error', 'Invalid login input', {
        fieldErrors: [{ field: 'email', message: 'Valid email and password are required' }],
      });
    }
    const result = await this.auth.login(data.email, data.password, preferredLanguage(request));
    response.cookie(COOKIE_NAME, result.token, {
      ...cookieOptions(), maxAge: 12 * 60 * 60 * 1000,
    });
    return result.me;
  }

  @Post('logout')
  @HttpCode(204)
  async logout(
    @Req() request: AuthRequest,
    @Res({ passthrough: true }) response: CookieResponse,
  ): Promise<void> {
    await this.auth.logout(requirePrincipal(request).sessionId);
    response.clearCookie(COOKIE_NAME, cookieOptions());
  }

  @Get('me')
  async getMe(@Req() request: AuthRequest): Promise<Me> {
    return this.auth.getMe(requirePrincipal(request).userId, preferredLanguage(request));
  }

  @Patch('me')
  async updateMe(@Req() request: AuthRequest, @Body() body: unknown): Promise<Me> {
    const data = bodyRecord(body);
    if (data.language !== undefined) {
      if (data.language !== 'en' && data.language !== 'id') {
        throw new ApiProblem(422, 'validation_error', 'Invalid language', {
          fieldErrors: [{ field: 'language', message: 'Must be en or id' }],
        });
      }
      await this.auth.updateLanguage(requirePrincipal(request).userId, data.language);
    }
    return this.auth.getMe(requirePrincipal(request).userId, preferredLanguage(request));
  }

  @Public()
  @Post('password/forgot')
  @HttpCode(202)
  async requestPasswordReset(@Body() body: unknown): Promise<void> {
    const data = bodyRecord(body);
    if (typeof data.email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
      throw new ApiProblem(422, 'validation_error', 'Invalid email', {
        fieldErrors: [{ field: 'email', message: 'Valid email is required' }],
      });
    }
    await this.links.requestReset(data.email);
  }

  @Public()
  @Get('password/tokens/:token')
  getPasswordToken(@Param('token') token: string): Promise<PasswordTokenInfo> {
    return this.links.getToken(token);
  }

  @Public()
  @Post('password/set')
  @HttpCode(200)
  async setPassword(
    @Body() body: unknown, @Res({ passthrough: true }) response: CookieResponse,
  ): Promise<Me> {
    const data = bodyRecord(body);
    if (typeof data.token !== 'string') {
      throw new ApiProblem(410, 'token_expired', 'Link expired');
    }
    const result = await this.links.setPassword(data.token, data.password);
    if (result.sessionToken) {
      response.cookie(COOKIE_NAME, result.sessionToken, {
        ...cookieOptions(), maxAge: 12 * 60 * 60 * 1000,
      });
    } else {
      response.clearCookie(COOKIE_NAME, cookieOptions());
    }
    return result.me;
  }
}
