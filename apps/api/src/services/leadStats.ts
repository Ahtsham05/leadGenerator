import {
  ANALYSIS_STATUSES,
  BOOKING_QUALITIES,
  LEAD_STATUSES,
  PRIORITIES,
  TRI_STATES,
  WEBSITE_QUALITIES,
  type CountBucket,
  type Lead,
  type LeadStats,
} from '@lead/shared';

export const STATS_DAYS = 30;
export const TOP_N = 8;

export function zeroCounts<K extends string>(keys: readonly K[]): Record<K, number> {
  return Object.fromEntries(keys.map((k) => [k, 0])) as Record<K, number>;
}

/** Turn grouped rows into a complete record; unknown keys are ignored. */
export function fillCounts<K extends string>(
  keys: readonly K[],
  rows: ReadonlyArray<{ _id: unknown; count: number }>,
): Record<K, number> {
  const out = zeroCounts(keys);
  for (const row of rows) {
    const key = String(row._id) as K;
    if (key in out) out[key] += row.count;
  }
  return out;
}

export const SCORE_BUCKET_LABELS = [
  '0-9',
  '10-19',
  '20-29',
  '30-39',
  '40-49',
  '50-59',
  '60-69',
  '70-79',
  '80-89',
  '90-100',
] as const;

export function scoreBucketIndex(score: number): number {
  return Math.min(9, Math.max(0, Math.floor(score / 10)));
}

/** `rows` carry the bucket lower bound (0, 10, ... 90) as `_id`. */
export function fillScoreBuckets(
  rows: ReadonlyArray<{ _id: unknown; count: number }>,
): CountBucket[] {
  const counts = new Array<number>(10).fill(0);
  for (const row of rows) {
    const lower = Number(row._id);
    if (Number.isFinite(lower)) counts[scoreBucketIndex(lower)]! += row.count;
  }
  return SCORE_BUCKET_LABELS.map((key, i) => ({ key, count: counts[i]! }));
}

export function utcDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** First day (UTC midnight) of the created-per-day window. */
export function statsWindowStart(now: Date, days = STATS_DAYS): Date {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  start.setUTCDate(start.getUTCDate() - (days - 1));
  return start;
}

/** `rows` carry a "YYYY-MM-DD" `_id`. Missing days are returned as zero. */
export function fillDays(
  rows: ReadonlyArray<{ _id: unknown; count: number }>,
  now: Date,
  days = STATS_DAYS,
): CountBucket[] {
  const byDay = new Map(rows.map((r) => [String(r._id), r.count]));
  const start = statsWindowStart(now, days);
  const out: CountBucket[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(start);
    d.setUTCDate(start.getUTCDate() + i);
    const key = utcDay(d);
    out.push({ key, count: byDay.get(key) ?? 0 });
  }
  return out;
}

export function topBuckets(
  rows: ReadonlyArray<{ _id: unknown; count: number }>,
  limit = TOP_N,
): CountBucket[] {
  return rows
    .filter((r) => r._id !== null && r._id !== undefined && String(r._id).trim() !== '')
    .map((r) => ({ key: String(r._id), count: r.count }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key))
    .slice(0, limit);
}

const mean = (values: number[]): number | null =>
  values.length === 0
    ? null
    : Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10;

/** Pure reference implementation, used by the in-memory repository and as the spec for Mongo. */
export function computeStats(leads: ReadonlyArray<Lead>, now = new Date()): LeadStats {
  const tally = <K extends string>(keys: readonly K[], pick: (l: Lead) => K | null | undefined) =>
    fillCounts(
      keys,
      Object.entries(
        leads.reduce<Record<string, number>>((acc, l) => {
          const k = pick(l);
          if (k) acc[k] = (acc[k] ?? 0) + 1;
          return acc;
        }, {}),
      ).map(([_id, count]) => ({ _id, count })),
    );
  const group = (keyOf: (l: Lead) => string[]) => {
    const m = new Map<string, number>();
    for (const l of leads) for (const k of new Set(keyOf(l))) m.set(k, (m.get(k) ?? 0) + 1);
    return [...m].map(([_id, count]) => ({ _id, count }));
  };

  const byAnalysisStatus = tally(ANALYSIS_STATUSES, (l) => l.analysisStatus);
  const scored = leads.filter((l): l is Lead & { score: number } => l.score !== null);
  const window = statsWindowStart(now);

  return {
    total: leads.length,
    analyzed: byAnalysisStatus.completed + byAnalysisStatus.partial,
    inProgress: byAnalysisStatus.pending + byAnalysisStatus.analyzing,
    needsAttention: byAnalysisStatus.failed + byAnalysisStatus.blocked,
    averageScore: mean(scored.map((l) => l.score)),
    averageMobileScore: mean(
      leads.map((l) => l.performance.mobileScore).filter((v): v is number => v !== null),
    ),
    byPriority: tally(PRIORITIES, (l) => l.priority),
    byLeadStatus: tally(LEAD_STATUSES, (l) => l.leadStatus),
    byAnalysisStatus,
    byBooking: tally(BOOKING_QUALITIES, (l) => l.features.onlineBooking.bookingQuality),
    byWebsiteQuality: tally(WEBSITE_QUALITIES, (l) => l.websiteQuality),
    byWhatsapp: tally(TRI_STATES, (l) => l.features.whatsapp.status),
    scoreDistribution: fillScoreBuckets(
      group((l) => (l.score === null ? [] : [String(scoreBucketIndex(l.score) * 10)])),
    ),
    topCities: topBuckets(group((l) => (l.city ? [l.city] : []))),
    topTechnologies: topBuckets(group((l) => l.technology.detectedSignatures.map((s) => s.name))),
    createdPerDay: fillDays(
      group((l) => (l.createdAt >= window ? [utcDay(l.createdAt)] : [])),
      now,
    ),
  };
}
