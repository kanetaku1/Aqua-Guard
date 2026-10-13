import { AuthRequest, requirePrincipal } from '../auth/session.guard';
import { ApiProblem } from '../http/problem';
import { UserScope } from './admin-users.service';

export function adminScope(request: AuthRequest): UserScope {
  const principal = requirePrincipal(request);
  if (principal.role !== 'system_administrator') {
    throw new ApiProblem(403, 'forbidden', 'Administrator access required');
  }
  return { companyId: principal.companyId, actorId: principal.userId };
}
