import { ApiProblem } from '../http/problem';

export function inputObject(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw invalid('body', 'Expected a JSON object');
  }
  return value as Record<string, unknown>;
}

export function invalid(field: string, message: string): ApiProblem {
  return new ApiProblem(422, 'validation_error', 'Invalid input', {
    fieldErrors: [{ field, message }],
  });
}

export function requiredText(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) throw invalid(field, 'Required text');
  return value.trim();
}

export function optionalEnum<T extends string>(
  value: unknown, field: string, choices: readonly T[], fallback: T,
): T {
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || !choices.includes(value as T)) {
    throw invalid(field, `Must be ${choices.join(' or ')}`);
  }
  return value as T;
}

export function positiveNumber(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw invalid(field, 'Must be greater than zero');
  }
  return value;
}
