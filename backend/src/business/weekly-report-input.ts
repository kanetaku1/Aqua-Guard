import { ApiProblem } from '../http/problem';

export interface WeeklyReportInput {
  farmCondition?: 'normal' | 'attention' | 'warning' | 'critical';
  alertNotes?: { alertId: string; cause: string | null;
    action: string | null; outcome: string | null }[];
  majorActions?: { id?: string; date: string; pondId: string | null;
    action: string }[];
  waterQualityComment?: string | null;
  technicalSummary?: string | null;
}

function invalid(field: string, message: string): never {
  throw new ApiProblem(422, 'validation_error', 'Invalid Weekly Report input',
    { fieldErrors: [{ field, message }] });
}
function object(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    invalid(field, 'Must be an object');
  }
  return value as Record<string, unknown>;
}
function text(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) invalid(field, 'Required text');
  return value;
}
function optionalText(value: unknown, field: string): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') invalid(field, 'Must be text or null');
  return value;
}
function date(value: unknown, field: string): string {
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\d$/.test(value)
    || !Number.isFinite(Date.parse(`${value}T00:00:00Z`))
    || new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value) {
    invalid(field, 'Must be a date');
  }
  return value;
}
function list(value: unknown, field: string): unknown[] {
  if (!Array.isArray(value)) invalid(field, 'Must be an array');
  return value;
}

export function parseWeeklyReportInput(body: unknown): WeeklyReportInput {
  const source = object(body, 'body');
  const result: WeeklyReportInput = {};
  if (source.farmCondition !== undefined) {
    if (!['normal', 'attention', 'warning', 'critical'].includes(
      source.farmCondition as string)) invalid('farmCondition', 'Unsupported value');
    result.farmCondition = source.farmCondition as WeeklyReportInput['farmCondition'];
  }
  if (source.waterQualityComment !== undefined) {
    result.waterQualityComment = optionalText(source.waterQualityComment,
      'waterQualityComment');
  }
  if (source.technicalSummary !== undefined) {
    result.technicalSummary = optionalText(source.technicalSummary,
      'technicalSummary');
  }
  if (source.alertNotes !== undefined) {
    result.alertNotes = list(source.alertNotes, 'alertNotes').map((value, index) => {
      const row = object(value, `alertNotes/${index}`);
      return { alertId: text(row.alertId, `alertNotes/${index}/alertId`),
        cause: optionalText(row.cause, `alertNotes/${index}/cause`),
        action: optionalText(row.action, `alertNotes/${index}/action`),
        outcome: optionalText(row.outcome, `alertNotes/${index}/outcome`) };
    });
    const ids = result.alertNotes.map((row) => row.alertId);
    if (new Set(ids).size !== ids.length) invalid('alertNotes', 'Duplicate Alert');
  }
  if (source.majorActions !== undefined) {
    result.majorActions = list(source.majorActions, 'majorActions')
      .map((value, index) => {
        const row = object(value, `majorActions/${index}`);
        return { id: row.id === undefined ? undefined
          : text(row.id, `majorActions/${index}/id`),
        date: date(row.date, `majorActions/${index}/date`),
        pondId: row.pondId === undefined || row.pondId === null ? null
          : text(row.pondId, `majorActions/${index}/pondId`),
        action: text(row.action, `majorActions/${index}/action`) };
      });
    const ids = result.majorActions.map((row) => row.id).filter(Boolean);
    if (new Set(ids).size !== ids.length) invalid('majorActions', 'Duplicate ID');
  }
  return result;
}
