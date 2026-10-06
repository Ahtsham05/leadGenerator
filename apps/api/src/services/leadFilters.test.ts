import { ListLeadsQuerySchema } from '@lead/shared';
import { describe, expect, it } from 'vitest';
import { buildLeadFilter, buildLeadSort } from './leadFilters.js';

const q = (raw: Record<string, string>) => ListLeadsQuerySchema.parse(raw);

describe('lead filters', () => {
  it('defaults: page 1, 25 per page, score desc', () => {
    const query = q({});
    expect(query).toMatchObject({ page: 1, pageSize: 25, sort: 'score', order: 'desc' });
    expect(buildLeadFilter(query)).toEqual({});
    expect(buildLeadSort(query)).toEqual({ score: -1, _id: -1 });
  });

  it('maps every filter to the right field', () => {
    const f = buildLeadFilter(
      q({
        priority: 'hot',
        city: 'Miami',
        status: 'completed',
        technology: 'WordPress',
        bookingStatus: 'none',
        whatsapp: 'no',
        minScore: '60',
        maxMobileScore: '49',
        minReviews: '100',
        search: 'exotic',
        hasWebsite: 'true',
      }),
    );
    expect(f).toMatchObject({
      priority: 'hot',
      analysisStatus: 'completed',
      'features.onlineBooking.bookingQuality': 'none',
      'features.whatsapp.status': 'no',
      score: { $gte: 60 },
      'performance.mobileScore': { $lte: 49 },
      reviewCount: { $gte: 100 },
      $text: { $search: 'exotic' },
    });
    expect((f.city as RegExp).test('miami')).toBe(true);
    expect((f['technology.detectedSignatures.name'] as RegExp).test('wordpress')).toBe(true);
  });

  it('escapes regex input', () => {
    const f = buildLeadFilter(q({ city: 'a.*' }));
    expect((f.city as RegExp).test('abc')).toBe(false);
  });

  it('rejects invalid values', () => {
    expect(() => q({ priority: 'urgent' })).toThrow();
    expect(() => q({ pageSize: '1000' })).toThrow();
    expect(() => q({ minScore: 'abc' })).toThrow();
  });

  it('sorts by nested mobile score', () => {
    expect(buildLeadSort(q({ sort: 'mobileScore', order: 'asc' }))).toEqual({
      'performance.mobileScore': 1,
      _id: 1,
    });
  });
});
