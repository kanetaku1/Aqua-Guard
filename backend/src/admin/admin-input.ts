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

export interface GeoPoint { lat: number; lng: number }

/** `undefined` keeps the stored position, `null` clears it. Stored to 6 decimals (about 0.1 m). */
export function optionalLocation(value: unknown, field: string): GeoPoint | null | undefined {
  if (value === undefined || value === null) return value;
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw invalid(field, 'Must be an object with lat and lng');
  }
  const { lat, lng } = value as Record<string, unknown>;
  const within = (n: unknown, limit: number): n is number =>
    typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= limit;
  if (!within(lat, 90)) throw invalid(`${field}.lat`, 'Must be between -90 and 90');
  if (!within(lng, 180)) throw invalid(`${field}.lng`, 'Must be between -180 and 180');
  const round = (n: number) => Math.round(n * 1e6) / 1e6;
  return { lat: round(lat), lng: round(lng) };
}

export function positiveNumber(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw invalid(field, 'Must be greater than zero');
  }
  return value;
}
