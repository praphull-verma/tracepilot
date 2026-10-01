export type FreshnessLevel = 'FRESH' | 'RECENT' | 'STALE' | 'VERY_STALE' | 'UNKNOWN';

export interface FreshnessResult {
  level: FreshnessLevel;
  daysOld: number | null;
  label: string;
  color: string;
}

const THRESHOLDS = {
  FRESH: 7,
  RECENT: 30,
  STALE: 90,
};

export function calculateFreshness(date: Date | null | undefined): FreshnessResult {
  if (!date) {
    return {
      level: 'UNKNOWN',
      daysOld: null,
      label: 'No data',
      color: 'gray',
    };
  }

  const daysOld = Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24));

  if (daysOld <= THRESHOLDS.FRESH) {
    return { level: 'FRESH', daysOld, label: `Fresh (${daysOld}d)`, color: 'green' };
  }
  if (daysOld <= THRESHOLDS.RECENT) {
    return { level: 'RECENT', daysOld, label: `Recent (${daysOld}d)`, color: 'blue' };
  }
  if (daysOld <= THRESHOLDS.STALE) {
    return { level: 'STALE', daysOld, label: `Stale (${daysOld}d)`, color: 'yellow' };
  }
  return { level: 'VERY_STALE', daysOld, label: `Very stale (${daysOld}d)`, color: 'red' };
}

export function freshnessToScore(level: FreshnessLevel): number {
  switch (level) {
    case 'FRESH': return 1.0;
    case 'RECENT': return 0.8;
    case 'STALE': return 0.5;
    case 'VERY_STALE': return 0.2;
    default: return 0.4;
  }
}

export function aggregateFreshness(dates: (Date | null | undefined)[]): FreshnessResult {
  const results = dates.map(calculateFreshness);
  const valid = results.filter((r) => r.daysOld !== null);
  if (valid.length === 0) return { level: 'UNKNOWN', daysOld: null, label: 'No data', color: 'gray' };
  const avgDays = valid.reduce((s, r) => s + (r.daysOld || 0), 0) / valid.length;
  return calculateFreshness(new Date(Date.now() - avgDays * 24 * 60 * 60 * 1000));
}
