import { Injectable } from '@nestjs/common';
import { AdminSettingsService } from '../admin/admin-settings.service';
import { PostgresService } from '../infrastructure/postgres.service';

type Severity = 'normal' | 'attention' | 'warning';
interface PondSample {
  pond_id: string; pond_name: string; started_on: string;
  sample_date: string | null; sample_count: number | null;
  sample_weight_g: string | null;
}
interface TargetPoint { doc: number; targetAbwG: number }

function days(later: string, earlier: string): number {
  return Math.round((Date.parse(`${later}T00:00:00Z`)
    - Date.parse(`${earlier}T00:00:00Z`)) / 86_400_000);
}

export function targetAt(doc: number, points: TargetPoint[]): number | null {
  if (!points.length || doc < points[0].doc || doc > points[points.length - 1].doc) return null;
  const highIndex = points.findIndex((point) => point.doc >= doc);
  const high = points[highIndex];
  if (high.doc === doc) return high.targetAbwG;
  const low = points[highIndex - 1];
  return low.targetAbwG + (high.targetAbwG - low.targetAbwG)
    * (doc - low.doc) / (high.doc - low.doc);
}

export function growthSeverity(behind: number, eligible: number,
  attentionPct: number, warningPct: number): Severity | null {
  if (eligible === 0) return null;
  const percentage = behind * 100 / eligible;
  return percentage >= warningPct ? 'warning'
    : percentage >= attentionPct ? 'attention' : 'normal';
}

@Injectable()
export class FarmGrowthStatusService {
  constructor(
    private readonly postgres: PostgresService,
    private readonly settings: AdminSettingsService,
  ) {}

  async snapshot(companyId: string, actorId: string, farmUuid: string) {
    const [growth, rules, samples] = await Promise.all([
      this.settings.getGrowth({ companyId, actorId }),
      this.postgres.pool.query<{
        production_attention_pct: string; production_warning_pct: string;
      }>(
        `SELECT production_attention_pct,production_warning_pct
         FROM operational_rule_versions WHERE company_id=$1 AND effective_to IS NULL`,
        [companyId],
      ),
      this.postgres.pool.query<PondSample>(
        `SELECT p.public_id AS pond_id,p.name AS pond_name,
           to_char(c.started_on,'YYYY-MM-DD') AS started_on,
           to_char(s.sample_date,'YYYY-MM-DD') AS sample_date,
           s.sample_count,s.sample_weight_g
         FROM ponds p JOIN production_cycles c ON c.pond_id=p.id AND c.status='active'
         LEFT JOIN LATERAL (
           SELECT sample_date,sample_count,sample_weight_g FROM sampling_records
           WHERE cycle_id=c.id AND sample_count IS NOT NULL AND sample_weight_g IS NOT NULL
           ORDER BY sample_date DESC LIMIT 1
         ) s ON true
         WHERE p.farm_id=$1 AND p.status='in_operation'
         ORDER BY p.public_id`, [farmUuid],
      ),
    ]);
    const behindPonds: { id: string; name: string; vsTargetPct: number }[] = [];
    let evaluated = 0;
    let latestSamplingDate: string | null = null;
    for (const row of samples.rows) {
      if (!row.sample_date || row.sample_count === null || row.sample_weight_g === null) continue;
      const target = targetAt(days(row.sample_date, row.started_on), growth.points);
      if (target === null) continue;
      const abw = Number(row.sample_weight_g) / row.sample_count;
      const pct = (abw / target - 1) * 100;
      evaluated += 1;
      if (!latestSamplingDate || row.sample_date > latestSamplingDate) {
        latestSamplingDate = row.sample_date;
      }
      if (pct <= -growth.onTrackBandPct) {
        behindPonds.push({ id: row.pond_id, name: row.pond_name, vsTargetPct: pct });
      }
    }
    const eligible = samples.rows.length;
    const attentionPct = Number(rules.rows[0]?.production_attention_pct ?? 25);
    const warningPct = Number(rules.rows[0]?.production_warning_pct ?? 50);
    return {
      sampleBasedStatus: evaluated === eligible
        ? growthSeverity(behindPonds.length, eligible, attentionPct, warningPct) : null,
      behind: behindPonds.length, eligible, evaluated, behindPonds, latestSamplingDate,
      // Survival estimation is not implemented, including cycles without stocking records.
      survivalTrendAvailable: false,
    };
  }
}
