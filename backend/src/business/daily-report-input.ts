import { ApiProblem } from '../http/problem';

export interface PondInput {
  pondId: string; values: Record<string, string | string[] | null>;
}
export interface ManualActionInput {
  id?: string; at: Date; pondId: string | null;
  action: string; outcome: string | null;
}
export interface ManualEquipmentInput {
  id?: string; equipment: string; pondId: string | null;
  failure: string; occurredAt: Date; action: string | null;
  status: 'in_progress' | 'resolved';
}
export interface DailyReportInput {
  ponds?: PondInput[];
  environment?: Record<string, string | number | null>;
  excludedAlertIds?: string[];
  manualActions?: ManualActionInput[];
  manualEquipmentEvents?: ManualEquipmentInput[];
  summary?: string | null;
}

function invalid(field: string, message: string): never {
  throw new ApiProblem(422, 'validation_error', 'Invalid Daily Report input',
    { fieldErrors: [{ field, message }] });
}
function object(value: unknown, field: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    invalid(field, 'Must be an object');
  }
  return value as Record<string, unknown>;
}
function requiredText(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) invalid(field, 'Required text');
  return value;
}
function optionalText(value: unknown, field: string): string | null {
  if (value === null) return null;
  if (typeof value !== 'string') invalid(field, 'Must be text or null');
  return value;
}
function oneOf(value: unknown, field: string, values: readonly string[]): string {
  if (typeof value !== 'string' || !values.includes(value)) {
    invalid(field, 'Unsupported value');
  }
  return value;
}
function timestamp(value: unknown, field: string): Date {
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.test(value)) {
    invalid(field, 'Must be a date-time');
  }
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) invalid(field, 'Must be a date-time');
  return date;
}
function optionalId(value: unknown, field: string): string | undefined {
  return value === undefined ? undefined : requiredText(value, field);
}
function pondId(value: unknown, field: string): string | null {
  return value === undefined || value === null ? null : requiredText(value, field);
}
function list(value: unknown, field: string): unknown[] {
  if (!Array.isArray(value)) invalid(field, 'Must be an array');
  return value;
}

const POND_FIELDS: Record<string, string> = {
  appetite: 'appetite', tray: 'tray', mortalityNote: 'mortality_note',
  health: 'health', observations: 'observations', healthNote: 'health_note',
};

export function parseDailyReportInput(body: unknown): DailyReportInput {
  const source = object(body, 'body');
  const result: DailyReportInput = {};
  if (source.ponds !== undefined) {
    const seen = new Set<string>();
    result.ponds = list(source.ponds, 'ponds').map((item, index) => {
      const row = object(item, `ponds/${index}`);
      const id = requiredText(row.pondId, `ponds/${index}/pondId`);
      if (seen.has(id)) invalid(`ponds/${index}/pondId`, 'Duplicate Pond');
      seen.add(id);
      const values: PondInput['values'] = {};
      for (const [field, column] of Object.entries(POND_FIELDS)) {
        if (row[field] === undefined) continue;
        const path = `ponds/${index}/${field}`;
        values[column] = field === 'appetite'
          ? oneOf(row[field], path, ['good', 'reduced', 'poor'])
          : field === 'tray'
            ? oneOf(row[field], path, ['clean', 'leftover', 'much_leftover'])
            : field === 'health'
              ? oneOf(row[field], path, ['normal', 'attention', 'warning', 'critical'])
              : field === 'observations'
                ? list(row[field], path).map((value, i) => oneOf(value, `${path}/${i}`,
                  ['reduced_appetite', 'abnormal_swimming', 'gill_discoloration',
                    'shell_condition', 'other']))
                : optionalText(row[field], path);
      }
      return { pondId: id, values };
    });
  }
  if (source.environment !== undefined) {
    const environment = object(source.environment, 'environment');
    const values: Record<string, string | number | null> = {};
    if (environment.weather !== undefined) values.weather = environment.weather === null
      ? null : oneOf(environment.weather, 'environment/weather',
        ['sunny', 'cloudy', 'rain', 'heavy_rain']);
    if (environment.rainfallMm !== undefined) {
      const amount = environment.rainfallMm;
      if (amount !== null && (typeof amount !== 'number'
        || !Number.isFinite(amount) || amount < 0)) {
        invalid('environment/rainfallMm', 'Must be zero or greater, or null');
      }
      values.rainfall_mm = amount as number | null;
    }
    if (environment.events !== undefined) {
      values.events = optionalText(environment.events, 'environment/events');
    }
    result.environment = values;
  }
  if (source.excludedAlertIds !== undefined) {
    result.excludedAlertIds = list(source.excludedAlertIds, 'excludedAlertIds')
      .map((value, index) => requiredText(value, `excludedAlertIds/${index}`));
    if (new Set(result.excludedAlertIds).size !== result.excludedAlertIds.length) {
      invalid('excludedAlertIds', 'Duplicate Alert');
    }
  }
  if (source.manualActions !== undefined) {
    result.manualActions = list(source.manualActions, 'manualActions').map((item, index) => {
      const row = object(item, `manualActions/${index}`);
      return {
        id: optionalId(row.id, `manualActions/${index}/id`),
        at: timestamp(row.at, `manualActions/${index}/at`),
        pondId: pondId(row.pondId, `manualActions/${index}/pondId`),
        action: requiredText(row.action, `manualActions/${index}/action`),
        outcome: row.outcome === undefined ? null
          : optionalText(row.outcome, `manualActions/${index}/outcome`),
      };
    });
    const ids = result.manualActions.map((item) => item.id).filter(Boolean);
    if (new Set(ids).size !== ids.length) invalid('manualActions', 'Duplicate ID');
  }
  if (source.manualEquipmentEvents !== undefined) {
    result.manualEquipmentEvents = list(source.manualEquipmentEvents,
      'manualEquipmentEvents').map((item, index) => {
      const row = object(item, `manualEquipmentEvents/${index}`);
      return {
        id: optionalId(row.id, `manualEquipmentEvents/${index}/id`),
        equipment: requiredText(row.equipment,
          `manualEquipmentEvents/${index}/equipment`),
        pondId: pondId(row.pondId, `manualEquipmentEvents/${index}/pondId`),
        failure: requiredText(row.failure, `manualEquipmentEvents/${index}/failure`),
        occurredAt: timestamp(row.occurredAt,
          `manualEquipmentEvents/${index}/occurredAt`),
        action: row.action === undefined ? null
          : optionalText(row.action, `manualEquipmentEvents/${index}/action`),
        status: oneOf(row.status, `manualEquipmentEvents/${index}/status`,
          ['in_progress', 'resolved']) as 'in_progress' | 'resolved',
      };
    });
    const ids = result.manualEquipmentEvents.map((item) => item.id).filter(Boolean);
    if (new Set(ids).size !== ids.length) invalid('manualEquipmentEvents', 'Duplicate ID');
  }
  if (source.summary !== undefined) result.summary = optionalText(source.summary, 'summary');
  return result;
}
