import { CanActivate, ExecutionContext, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthService, Principal } from './auth.service';
import { ApiProblem } from '../http/problem';

const PUBLIC_ROUTE = 'publicRoute';
export const Public = () => SetMetadata(PUBLIC_ROUTE, true);

export interface AuthRequest {
  headers: { cookie?: string; 'accept-language'?: string };
  principal?: Principal;
}

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly auth: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (this.reflector.getAllAndOverride<boolean>(PUBLIC_ROUTE, [
      context.getHandler(), context.getClass(),
    ])) return true;
    const request = context.switchToHttp().getRequest<AuthRequest>();
    const cookie = request.headers.cookie ?? '';
    const token = /(?:^|;\s*)aquaguard_session=([0-9a-f]{64})(?:;|$)/.exec(cookie)?.[1];
    const principal = token ? await this.auth.authenticate(token) : null;
    if (!principal) throw new ApiProblem(401, 'unauthorized', 'Unauthorized');
    request.principal = principal;
    return true;
  }
}

export function requirePrincipal(request: AuthRequest): Principal {
  if (!request.principal) throw new ApiProblem(401, 'unauthorized', 'Unauthorized');
  return request.principal;
}

export function preferredLanguage(request: AuthRequest): 'en' | 'id' | undefined {
  const first = request.headers['accept-language']?.split(',')[0]?.trim().toLowerCase();
  return first === 'en' || first === 'id' ? first : undefined;
}
