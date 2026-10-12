import { Injectable } from '@nestjs/common';
import { PostgresService } from '../infrastructure/postgres.service';
import { DailyReportRecordsService } from './daily-report-records.service';

type Appetite = 'good' | 'reduced' | 'poor';
type Tray = 'clean' | 'leftover' | 'much_leftover';
type Health = 'normal' | 'attention' | 'warning' | 'critical';
interface InputRow {
  pond_id: string; farm_id: string; appetite: Appetite | null; tray: Tray | null;
  mortality_note: string | null; health: Health | null;
  observations: string[]; health_note: string | null;
}

@Injectable()
export class DailyReportPondsService {
  constructor(
    private readonly postgres: PostgresService,
    private readonly records: DailyReportRecordsService,
  ) {}

  async snapshot(reportUuid: string, farmUuid: string, date: string) {
    const [records, inputs] = await Promise.all([
      this.records.snapshot(farmUuid, date),
      this.postgres.pool.query<InputRow>(
        `SELECT p.public_id AS pond_id,p.farm_id,i.appetite,i.tray,
           i.mortality_note,i.health,i.observations,i.health_note
         FROM daily_report_pond_inputs i JOIN ponds p ON p.id=i.pond_id
         WHERE i.report_id=$1`, [reportUuid],
      ),
    ]);
    if (inputs.rows.some((row) => row.farm_id !== farmUuid)) {
      throw new Error('Daily Report has input from another Farm');
    }
    const byPond = new Map(inputs.rows.map((row) => [row.pond_id, row]));
    const ponds = records.ponds.map((record) => {
      const input = byPond.get(record.pond.id);
      return {
        ...record,
        // These are editable draft form defaults defined by the frontend Mock.
        appetite: input?.appetite ?? 'good',
        tray: input?.tray ?? 'clean',
        mortalityNote: input?.mortality_note ?? null,
        health: input?.health ?? 'normal',
        observations: input?.observations ?? [],
        healthNote: input?.health_note ?? null,
      };
    });
    return { ponds, totals: {
      ...records.totals,
      reducedAppetitePonds: ponds.filter((pond) => pond.appetite !== 'good').length,
      leftoverTrayPonds: ponds.filter((pond) => pond.tray !== 'clean').length,
      healthNotedPonds: ponds.filter((pond) => pond.health !== 'normal').length,
    } };
  }
}
