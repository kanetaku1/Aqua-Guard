import { Controller, Get, Param, Query, Req } from '@nestjs/common';
import { AuthRequest, preferredLanguage, requirePrincipal } from '../auth/session.guard';
import { IssuesService } from './issues.service';

@Controller('issues')
export class IssuesController {
  constructor(private readonly issues: IssuesService) {}

  @Get()
  list(@Req() request: AuthRequest, @Query() query: Record<string, unknown>) {
    return this.issues.list(requirePrincipal(request), query, preferredLanguage(request));
  }

  @Get(':issueId')
  get(@Req() request: AuthRequest, @Param('issueId') issueId: string) {
    return this.issues.get(requirePrincipal(request), issueId, preferredLanguage(request));
  }
}
