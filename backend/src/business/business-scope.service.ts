import { Injectable } from '@nestjs/common';
import { Principal } from '../auth/auth.service';
import { ApiProblem } from '../http/problem';
import { PostgresService } from '../infrastructure/postgres.service';

@Injectable()
export class BusinessScopeService {
  constructor(private readonly postgres: PostgresService) {}

  async visibleFarmIds(principal: Principal): Promise<string[]> {
    if (principal.role === 'system_administrator') {
      throw new ApiProblem(403, 'forbidden', 'Business access required');
    }
    if (principal.role === 'farms_manager') {
      const result = await this.postgres.pool.query<{ public_id: string }>(
        'SELECT public_id FROM farms WHERE company_id = $1 ORDER BY public_id',
        [principal.companyId],
      );
      return result.rows.map((row) => row.public_id);
    }
    const result = await this.postgres.pool.query<{ public_id: string }>(
      `SELECT f.public_id FROM user_farm_assignments a
       JOIN farms f ON f.id = a.farm_id
       WHERE a.user_id = $1 AND a.unassigned_at IS NULL AND f.company_id = $2`,
      [principal.userId, principal.companyId],
    );
    if (!result.rows[0]) {
      throw new ApiProblem(403, 'farm_assignment_required', 'Farm assignment required');
    }
    return result.rows.map((row) => row.public_id);
  }
}
