import { Injectable } from '@nestjs/common';
import { AdminThresholdsService, Threshold } from '../admin/admin-thresholds.service';
import { PostgresService } from '../infrastructure/postgres.service';
import { severityFor } from './sensor-current.service';

const LABS = ['tan', 'no2', 'vibrio', 'alkalinity'] as const;
type Lab = typeof LABS[number];
interface Row {
  public_id: string; name: string; sampled_on: string | null;
  tan: string | null; no2: string | null; vibrio: string | null;
  alkalinity: string | null;
}

function nextWeek(start: string): string {
  return new Date(Date.parse(`${start}T00:00:00Z`) + 7 * 86_400_000)
    .toISOString().slice(0, 10);
}

@Injectable()
export class WeeklyLaboratoryService {
  constructor(
    private readonly postgres: PostgresService,
    private readonly thresholds: AdminThresholdsService,
  ) {}

  async snapshot(companyId: string, farmUuid: string, weekStart: string) {
    const [ponds, thresholds] = await Promise.all([
      this.postgres.pool.query<Row>(
        `SELECT p.public_id,p.name,
           to_char(s.sample_date,'YYYY-MM-DD') AS sampled_on,
           s.tan,s.no2,s.vibrio,s.alkalinity
         FROM ponds p LEFT JOIN LATERAL (
           SELECT sample_date,tan,no2,vibrio,alkalinity
           FROM sampling_records WHERE pond_id=p.id
             AND sample_date >= $2::date AND sample_date < $3::date
           ORDER BY sample_date DESC,updated_at DESC LIMIT 1
         ) s ON true
         WHERE p.farm_id=$1 ORDER BY p.name,p.public_id`,
        [farmUuid, weekStart, nextWeek(weekStart)],
      ),
      Promise.all(LABS.map((lab) =>
        this.thresholds.effectiveThreshold(companyId, farmUuid, lab))),
    ]);
    const limits = new Map<Lab, Threshold>(
      LABS.map((lab, index) => [lab, thresholds[index]]));
    return ponds.rows.map((row) => {
      const values = Object.fromEntries(LABS.map((lab) =>
        [lab, row[lab] === null ? null : Number(row[lab])])) as Record<Lab, number | null>;
      const severity = Object.fromEntries(LABS.map((lab) =>
        [lab, values[lab] === null ? null
          : severityFor(values[lab], limits.get(lab)!)]));
      return { pond: { id: row.public_id, name: row.name },
        laboratory: { sampledOn: row.sampled_on,
          pending: LABS.some((lab) => values[lab] === null),
          expectedOn: null, ...values, severity } };
    });
  }
}
