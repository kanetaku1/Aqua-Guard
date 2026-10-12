import { Injectable } from '@nestjs/common';
import { Principal } from '../auth/auth.service';
import { ApiProblem } from '../http/problem';
import { PostgresService } from '../infrastructure/postgres.service';
import { BusinessScopeService } from './business-scope.service';
import { DailyReportSubmitService } from './daily-report-submit.service';
import { WeeklyReportSubmitService } from './weekly-report-submit.service';

@Injectable()
export class ReportSubmitService {
  constructor(
    private readonly postgres: PostgresService,
    private readonly scope: BusinessScopeService,
    private readonly daily: DailyReportSubmitService,
    private readonly weekly: WeeklyReportSubmitService,
  ) {}

  async submit(principal: Principal, reportId: string, language?: 'en' | 'id') {
    if (principal.role !== 'technical_manager') {
      throw new ApiProblem(403, 'forbidden', 'Technical manager access required');
    }
    const visible = await this.scope.visibleFarmIds(principal);
    const result = await this.postgres.pool.query<{ type: string }>(
      `SELECT r.type FROM reports r JOIN farms f ON f.id=r.farm_id
       WHERE r.public_id=$1 AND f.company_id=$2 AND f.public_id=ANY($3)`,
      [reportId, principal.companyId, visible],
    );
    if (!result.rows[0]) throw new ApiProblem(404, 'not_found', 'Report not found');
    return result.rows[0].type === 'weekly'
      ? this.weekly.submit(principal, reportId, language)
      : this.daily.submit(principal, reportId, language);
  }
}
