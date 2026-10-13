import { Injectable } from '@nestjs/common';
import { ApiProblem } from '../http/problem';
import { PostgresService } from '../infrastructure/postgres.service';

interface PondRow { id: string; public_id: string; name: string }
interface SampleRow {
  pond_id: string; sample_date: string; sample_count: number | null;
  sample_weight_g: string | null; tan: string | null; no2: string | null;
  vibrio: string | null; alkalinity: string | null;
}

function nextWeek(start: string): string {
  return new Date(Date.parse(`${start}T00:00:00Z`) + 7 * 86_400_000)
    .toISOString().slice(0, 10);
}

@Injectable()
export class WeeklySamplingCoverageService {
  constructor(private readonly postgres: PostgresService) {}

  async snapshot(farmUuid: string, weekStart: string) {
    const parsed = Date.parse(`${weekStart}T00:00:00Z`);
    if (!/^\d{4}-\d\d-\d\d$/.test(weekStart) || !Number.isFinite(parsed)
      || new Date(parsed).toISOString().slice(0, 10) !== weekStart
      || new Date(parsed).getUTCDay() !== 1) {
      throw new ApiProblem(422, 'validation_error', 'Week start must be a Monday',
        { fieldErrors: [{ field: 'weekStart', message: 'Must be a Monday date' }] });
    }
    const weekAfter = nextWeek(weekStart);
    const [ponds, samples] = await Promise.all([
      this.postgres.pool.query<PondRow>(
        `SELECT id,public_id,name FROM ponds WHERE farm_id=$1 ORDER BY name,public_id`,
        [farmUuid],
      ),
      this.postgres.pool.query<SampleRow>(
        `SELECT s.pond_id,to_char(s.sample_date,'YYYY-MM-DD') AS sample_date,
           s.sample_count,s.sample_weight_g,s.tan,s.no2,s.vibrio,s.alkalinity
         FROM sampling_records s JOIN ponds p ON p.id=s.pond_id
         WHERE p.farm_id=$1 AND s.sample_date >= $2::date
           AND s.sample_date < $3::date
         ORDER BY s.sample_date DESC,s.updated_at DESC`,
        [farmUuid, weekStart, weekAfter],
      ),
    ]);
    const latest = new Map<string, SampleRow>();
    const measured = new Set<string>();
    let date: string | null = null;
    for (const row of samples.rows) {
      if (!latest.has(row.pond_id)) latest.set(row.pond_id, row);
      if (row.sample_count !== null && row.sample_weight_g !== null) {
        measured.add(row.pond_id);
        if (date === null || row.sample_date > date) date = row.sample_date;
      }
    }
    const labReceived = ponds.rows.filter((pond) => {
      const row = latest.get(pond.id);
      return row && row.tan !== null && row.no2 !== null
        && row.vibrio !== null && row.alkalinity !== null;
    }).length;
    return {
      date, sampled: measured.size, total: ponds.rows.length, labReceived,
      notSampled: ponds.rows.filter((pond) => !measured.has(pond.id))
        .map((pond) => ({ id: pond.public_id, name: pond.name })),
    };
  }
}
