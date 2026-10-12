import { Injectable, Logger } from '@nestjs/common';
import { PoolClient } from 'pg';
import { PostgresService } from './postgres.service';

interface OutboxRow { id: string; alert_id: string; attempt_count: number }

@Injectable()
export class AlertNotificationMaterializerService {
  private readonly logger = new Logger(AlertNotificationMaterializerService.name);

  constructor(private readonly postgres: PostgresService) {}

  async runOnce(limit = 50): Promise<{ materialized: number; noRecipient: number; failed: number }> {
    if (!Number.isInteger(limit) || limit < 1 || limit > 500) {
      throw new Error('Notification batch limit must be between 1 and 500');
    }
    const result = { materialized: 0, noRecipient: 0, failed: 0 };
    for (let index = 0; index < limit; index++) {
      const client = await this.postgres.pool.connect();
      let row: OutboxRow | undefined;
      try {
        await client.query('BEGIN');
        const pending = await client.query<OutboxRow>(
          `SELECT id, alert_id, attempt_count FROM alert_notification_outbox
           WHERE status IN ('pending','failed')
             AND (next_attempt_at IS NULL OR next_attempt_at <= now())
           ORDER BY detected_at,id LIMIT 1 FOR UPDATE SKIP LOCKED`,
        );
        row = pending.rows[0];
        if (!row) {
          await client.query('COMMIT');
          break;
        }
        await client.query('SAVEPOINT notification_materialize');
        let recipients: number;
        try {
          recipients = await this.insertRecipients(client, row);
          await client.query(
            `UPDATE alert_notification_outbox SET status=$2, attempt_count=attempt_count+1,
               materialized_at=now(), next_attempt_at=NULL, last_error=NULL WHERE id=$1`,
            [row.id, recipients ? 'materialized' : 'no_recipient'],
          );
        } catch (error) {
          await client.query('ROLLBACK TO SAVEPOINT notification_materialize');
          const delaySeconds = Math.min(3600, 5 * 2 ** Math.min(row.attempt_count, 10));
          await client.query(
            `UPDATE alert_notification_outbox SET status='failed',
               attempt_count=attempt_count+1, last_error=$2,
               next_attempt_at=now()+($3::integer * interval '1 second')
             WHERE id=$1`,
            [row.id, error instanceof Error ? error.message.slice(0, 500) : 'unknown error',
              delaySeconds],
          );
          await client.query('COMMIT');
          result.failed++;
          this.logger.error(`Failed to materialize notification ${row.id}`, error);
          continue;
        }
        await client.query('COMMIT');
        if (recipients) result.materialized++;
        else result.noRecipient++;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    }
    return result;
  }

  private async insertRecipients(client: PoolClient, row: OutboxRow): Promise<number> {
    const inserted = await client.query<{ user_id: string }>(
      `INSERT INTO alert_notifications (outbox_id,user_id)
       SELECT $1,u.id FROM alert_notification_outbox o
       JOIN alerts al ON al.id=o.alert_id
       JOIN ponds p ON p.id=al.pond_id
       JOIN farms f ON f.id=p.farm_id
       JOIN users u ON u.company_id=f.company_id AND u.status='active'
       WHERE o.id=$1 AND o.alert_id=$2 AND o.event_kind='critical_detected'
         AND (u.role='farms_manager' OR (u.role='technical_manager' AND EXISTS (
           SELECT 1 FROM user_farm_assignments a
           WHERE a.user_id=u.id AND a.farm_id=f.id AND a.unassigned_at IS NULL
         )))
       ON CONFLICT (outbox_id,user_id) DO NOTHING RETURNING user_id`,
      [row.id, row.alert_id],
    );
    if (inserted.rowCount) return inserted.rowCount;
    const existing = await client.query<{ count: string }>(
      'SELECT count(*) FROM alert_notifications WHERE outbox_id=$1', [row.id],
    );
    return Number(existing.rows[0].count);
  }
}
