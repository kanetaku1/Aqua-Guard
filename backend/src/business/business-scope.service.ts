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

  async requirePond(principal: Principal, pondId: string): Promise<{
    pondUuid: string; pondId: string; farmUuid: string; farmId: string;
  }> {
    const farmIds = await this.visibleFarmIds(principal);
    const result = await this.postgres.pool.query<{
      pond_uuid: string; pond_id: string; farm_uuid: string; farm_id: string;
    }>(
      `SELECT p.id AS pond_uuid, p.public_id AS pond_id,
         f.id AS farm_uuid, f.public_id AS farm_id
       FROM ponds p JOIN farms f ON f.id = p.farm_id
       WHERE p.public_id = $1 AND f.company_id = $2 AND f.public_id = ANY($3)`,
      [pondId, principal.companyId, farmIds],
    );
    const row = result.rows[0];
    if (!row) throw new ApiProblem(404, 'not_found', 'Pond not found');
    return { pondUuid: row.pond_uuid, pondId: row.pond_id,
      farmUuid: row.farm_uuid, farmId: row.farm_id };
  }
}
