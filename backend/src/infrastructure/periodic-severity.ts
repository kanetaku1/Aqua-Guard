import { Threshold } from '../admin/admin-thresholds.service';

export type Direction = 'low' | 'high';
export type PeriodicSeverity = 'normal' | 'attention' | 'warning' | 'critical';

export function sideSeverity(value: number, threshold: Threshold, direction: Direction): {
  severity: PeriodicSeverity; boundary: number | null;
} {
  const checks = direction === 'low'
    ? [
      ['critical', threshold.criticalLow],
      ['warning', threshold.warningLow],
      ['attention', threshold.attentionLow],
    ] as const
    : [
      ['critical', threshold.criticalHigh],
      ['warning', threshold.warningHigh],
      ['attention', threshold.attentionHigh],
    ] as const;
  for (const [severity, boundary] of checks) {
    if (boundary !== null && (direction === 'low' ? value < boundary : value > boundary)) {
      return { severity, boundary };
    }
  }
  return { severity: 'normal', boundary: null };
}

export function anomalyStart(previousStart: Date | null, previousPoint: Date | null,
  currentPoint: Date, maximumGapMs: number): Date {
  return previousStart && previousPoint
    && currentPoint.getTime() - previousPoint.getTime() <= maximumGapMs
    ? previousStart : currentPoint;
}
