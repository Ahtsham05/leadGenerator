import { describe, expect, it } from 'vitest';
import { emptyFeatures, emptyTechnology } from '@lead/shared';
import { makeLead } from '../../test/helpers/memoryRepo.js';
import {
  computeStats,
  fillCounts,
  fillDays,
  fillScoreBuckets,
  scoreBucketIndex,
  topBuckets,
} from './leadStats.js';

const NOW = new Date('2026-10-06T10:00:00Z');

describe('leadStats helpers', () => {
  it('fillCounts returns every key and ignores unknown ones', () => {
    expect(
      fillCounts(['a', 'b'] as const, [
        { _id: 'a', count: 3 },
        { _id: 'zzz', count: 9 },
      ]),
    ).toEqual({ a: 3, b: 0 });
  });

  it('scoreBucketIndex clamps 100 into the last bucket', () => {
    expect(scoreBucketIndex(0)).toBe(0);
    expect(scoreBucketIndex(9)).toBe(0);
    expect(scoreBucketIndex(10)).toBe(1);
    expect(scoreBucketIndex(99)).toBe(9);
    expect(scoreBucketIndex(100)).toBe(9);
  });

  it('fillScoreBuckets always returns ten labelled buckets', () => {
    const out = fillScoreBuckets([{ _id: 80, count: 2 }]);
    expect(out).toHaveLength(10);
    expect(out[8]).toEqual({ key: '80-89', count: 2 });
    expect(out[9]).toEqual({ key: '90-100', count: 0 });
  });

  it('fillDays returns 30 consecutive UTC days ending today, zeros included', () => {
    const out = fillDays([{ _id: '2026-10-06', count: 4 }], NOW);
    expect(out).toHaveLength(30);
    expect(out[29]).toEqual({ key: '2026-10-06', count: 4 });
    expect(out[0]!.key).toBe('2026-09-07');
    expect(out[28]).toEqual({ key: '2026-10-05', count: 0 });
  });

  it('topBuckets drops blanks, sorts by count then name and limits', () => {
    const out = topBuckets(
      [
        { _id: 'Miami', count: 2 },
        { _id: '', count: 50 },
        { _id: null, count: 50 },
        { _id: 'Austin', count: 2 },
        { _id: 'Denver', count: 5 },
      ],
      2,
    );
    expect(out).toEqual([
      { key: 'Denver', count: 5 },
      { key: 'Austin', count: 2 },
    ]);
  });
});

describe('computeStats', () => {
  it('is all zeros for no leads', () => {
    const s = computeStats([], NOW);
    expect(s.total).toBe(0);
    expect(s.averageScore).toBeNull();
    expect(s.byPriority).toEqual({ hot: 0, high: 0, medium: 0, low: 0 });
    expect(s.createdPerDay).toHaveLength(30);
  });

  it('summarises a mixed set of leads', () => {
    const features = emptyFeatures();
    features.onlineBooking.bookingQuality = 'none';
    const technology = { ...emptyTechnology() };
    technology.detectedSignatures = [
      { name: 'Wix', category: 'builder', evidence: 'x' },
      { name: 'Wix', category: 'builder', evidence: 'y' },
    ];
    const leads = [
      makeLead({
        analysisStatus: 'completed',
        score: 85,
        priority: 'hot',
        city: 'Miami',
        features,
        technology,
        createdAt: new Date('2026-10-05T12:00:00Z'),
      }),
      makeLead({ analysisStatus: 'partial', score: 41, priority: 'medium', city: 'Miami' }),
      makeLead({ analysisStatus: 'pending' }),
      makeLead({ analysisStatus: 'blocked' }),
      makeLead({ analysisStatus: 'failed', createdAt: new Date('2025-01-01T00:00:00Z') }),
    ];
    const s = computeStats(leads, NOW);
    expect(s).toMatchObject({
      total: 5,
      analyzed: 2,
      inProgress: 1,
      needsAttention: 2,
      averageScore: 63,
    });
    expect(s.byPriority).toEqual({ hot: 1, high: 0, medium: 1, low: 0 });
    expect(s.byBooking.none).toBe(1);
    expect(s.scoreDistribution[8]!.count).toBe(1);
    expect(s.scoreDistribution[4]!.count).toBe(1);
    expect(s.topCities).toEqual([{ key: 'Miami', count: 2 }]);
    // The same technology twice on one lead still counts the lead once.
    expect(s.topTechnologies).toEqual([{ key: 'Wix', count: 1 }]);
    // The 2025 lead falls outside the 30 day window.
    expect(s.createdPerDay.find((d) => d.key === '2026-10-05')!.count).toBe(1);
  });
});
