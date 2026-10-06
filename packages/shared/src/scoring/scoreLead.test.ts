import { describe, expect, it } from 'vitest';
import { priorityFor, scoreLead } from './scoreLead.js';
import { DEFAULT_SCORING_WEIGHTS, ScoringWeightsSchema } from './weights.js';
import { makeScoringInput } from './testHelpers.js';

const pointsFor = (r: ReturnType<typeof scoreLead>, rule: string) =>
  r.breakdown.filter((b) => b.rule === rule).reduce((s, b) => s + b.points, 0);

describe('weights config', () => {
  it('default weights are valid and sum to 100', () => {
    expect(ScoringWeightsSchema.safeParse(DEFAULT_SCORING_WEIGHTS).success).toBe(true);
  });
  it('rejects weights whose maxima do not sum to 100', () => {
    const bad = {
      ...DEFAULT_SCORING_WEIGHTS,
      website: { ...DEFAULT_SCORING_WEIGHTS.website, max: 31 },
    };
    expect(ScoringWeightsSchema.safeParse(bad).success).toBe(false);
  });
});

describe('website opportunity', () => {
  it.each([
    ['none', 30],
    ['poor', 25],
    ['average', 12],
    ['good', 3],
    ['excellent', 0],
    ['unknown', 10],
  ] as const)('%s gives %d', (quality, pts) => {
    const r = scoreLead(makeScoringInput({ websiteQuality: quality }));
    expect(r.categoryTotals.website).toBe(pts);
  });
});

describe('performance', () => {
  it.each([
    [0, 10],
    [29, 10],
    [30, 8],
    [49, 8],
    [50, 5],
    [64, 5],
    [65, 2],
    [79, 2],
    [80, 0],
    [100, 0],
  ])('mobile score %d gives %d', (mobileScore, pts) => {
    const r = scoreLead(makeScoringInput({ performance: { mobileScore, lcpMs: 1000, cls: 0 } }));
    expect(r.categoryTotals.performance).toBe(pts);
  });

  it.each([
    [2499, 0],
    [2500, 3],
    [4000, 3],
    [4001, 6],
  ])('LCP %d ms gives %d', (lcpMs, pts) => {
    const r = scoreLead(makeScoringInput({ performance: { mobileScore: 95, lcpMs, cls: 0 } }));
    expect(r.categoryTotals.performance).toBe(pts);
  });

  it.each([
    [0.099, 0],
    [0.1, 2],
    [0.25, 2],
    [0.251, 4],
  ])('CLS %d gives %d', (cls, pts) => {
    const r = scoreLead(makeScoringInput({ performance: { mobileScore: 95, lcpMs: 1000, cls } }));
    expect(r.categoryTotals.performance).toBe(pts);
  });

  it('worst performance hits exactly 20', () => {
    const r = scoreLead(
      makeScoringInput({ performance: { mobileScore: 10, lcpMs: 9000, cls: 0.6 } }),
    );
    expect(r.categoryTotals.performance).toBe(20);
  });

  it('caps the category and keeps the breakdown summing to the total', () => {
    const weights = structuredClone(DEFAULT_SCORING_WEIGHTS);
    weights.performance.lcp.severePoints = 15;
    const r = scoreLead(
      makeScoringInput({ performance: { mobileScore: 10, lcpMs: 9000, cls: 0.6 } }),
      weights,
    );
    expect(
      r.breakdown.filter((b) => b.category === 'performance').reduce((s, b) => s + b.points, 0),
    ).toBe(20);
    expect(r.categoryTotals.performance).toBe(20);
    expect(r.notes.some((n) => n.includes('capped'))).toBe(true);
    expect(r.breakdown.reduce((s, b) => s + b.points, 0)).toBe(r.score);
  });

  it('gives 0 and a note when performance data is unavailable', () => {
    const r = scoreLead(
      makeScoringInput({ performance: { performanceStatus: 'unavailable', mobileScore: null } }),
    );
    expect(r.categoryTotals.performance).toBe(0);
    expect(r.notes).toContain('Performance data unavailable; performance category scored 0.');
  });
});

describe('booking', () => {
  it('none gives 15, plus 5 with no contact form', () => {
    const a = scoreLead(
      makeScoringInput({
        features: { onlineBooking: { bookingQuality: 'none' }, contactForm: { status: 'yes' } },
      }),
    );
    expect(a.categoryTotals.booking).toBe(15);
    const b = scoreLead(
      makeScoringInput({
        features: { onlineBooking: { bookingQuality: 'none' }, contactForm: { status: 'no' } },
      }),
    );
    expect(b.categoryTotals.booking).toBe(20);
  });
  it('unknown contact form does not trigger the bonus', () => {
    const r = scoreLead(
      makeScoringInput({ features: { onlineBooking: { bookingQuality: 'none' } } }),
    );
    expect(r.categoryTotals.booking).toBe(15);
  });
  it.each([
    ['basic', 8],
    ['good', 2],
    ['unknown', 6],
  ] as const)('%s gives %d', (bookingQuality, pts) => {
    const r = scoreLead(makeScoringInput({ features: { onlineBooking: { bookingQuality } } }));
    expect(r.categoryTotals.booking).toBe(pts);
  });
});

describe('automation gaps', () => {
  it('counts only proven "no" signals', () => {
    const unknown = scoreLead(makeScoringInput());
    expect(unknown.categoryTotals.automation).toBe(0);
    const all = scoreLead(
      makeScoringInput({
        features: {
          whatsapp: { status: 'no' },
          chatbot: { status: 'no' },
          onlinePayment: { status: 'no' },
          automatedFollowUp: { status: 'no' },
        },
      }),
    );
    expect(all.categoryTotals.automation).toBe(15);
    expect(pointsFor(all, 'automation.noWhatsapp')).toBe(5);
    expect(pointsFor(all, 'automation.noChatbot')).toBe(4);
    expect(pointsFor(all, 'automation.noOnlinePayment')).toBe(3);
    expect(pointsFor(all, 'automation.noAutomatedFollowUp')).toBe(3);
  });
  it('"yes" signals give no points', () => {
    const r = scoreLead(
      makeScoringInput({ features: { whatsapp: { status: 'yes' }, chatbot: { status: 'yes' } } }),
    );
    expect(r.categoryTotals.automation).toBe(0);
  });
});

describe('business attractiveness', () => {
  it('detects luxury keywords in name or types', () => {
    expect(
      scoreLead(makeScoringInput({ businessName: 'Miami Exotic Rentals' })).categoryTotals
        .attractiveness,
    ).toBe(5);
    expect(
      scoreLead(makeScoringInput({ types: ['luxury_car_rental'] })).categoryTotals.attractiveness,
    ).toBe(5);
    expect(
      scoreLead(makeScoringInput({ businessName: 'Budget Wheels' })).categoryTotals.attractiveness,
    ).toBe(0);
  });
  it.each([
    [99, 0],
    [100, 3],
    [499, 3],
    [500, 5],
  ])('%d reviews gives %d (tier 2 replaces tier 1)', (reviewCount, pts) => {
    expect(scoreLead(makeScoringInput({ reviewCount })).categoryTotals.attractiveness).toBe(pts);
  });
  it('rating boundary 4.3', () => {
    expect(scoreLead(makeScoringInput({ rating: 4.29 })).categoryTotals.attractiveness).toBe(0);
    expect(scoreLead(makeScoringInput({ rating: 4.3 })).categoryTotals.attractiveness).toBe(2);
  });
  it('instagram link adds 3 and max is 15', () => {
    const r = scoreLead(
      makeScoringInput({
        businessName: 'Prestige Supercar Hire',
        reviewCount: 800,
        rating: 4.9,
        instagramUrl: 'https://instagram.com/prestige',
      }),
    );
    expect(r.categoryTotals.attractiveness).toBe(15);
  });
});

describe('totals, priority and confidence', () => {
  it('maximum possible score is 100 and hot', () => {
    const r = scoreLead(
      makeScoringInput({
        websiteQuality: 'none',
        businessName: 'Exotic Car Rental',
        reviewCount: 600,
        rating: 4.8,
        instagramUrl: 'https://instagram.com/x',
        performance: { mobileScore: 5, lcpMs: 8000, cls: 0.5 },
        features: {
          onlineBooking: { bookingQuality: 'none' },
          contactForm: { status: 'no' },
          whatsapp: { status: 'no' },
          chatbot: { status: 'no' },
          onlinePayment: { status: 'no' },
          automatedFollowUp: { status: 'no' },
        },
      }),
    );
    expect(r.score).toBe(100);
    expect(r.priority).toBe('hot');
    expect(r.confidence).toBe(1);
  });

  it.each([
    [100, 'hot'],
    [80, 'hot'],
    [79, 'high'],
    [60, 'high'],
    [59, 'medium'],
    [40, 'medium'],
    [39, 'low'],
    [0, 'low'],
  ] as const)('score %d is %s', (score, priority) => {
    expect(priorityFor(score)).toBe(priority);
  });

  it('confidence drops with unknown signals', () => {
    const r = scoreLead(
      makeScoringInput({ websiteQuality: 'unknown', performance: { performanceStatus: 'failed' } }),
    );
    // Only nothing known except... all features unknown, reviews/rating null => 0 of 10.
    expect(r.confidence).toBe(0);
  });

  it('every breakdown item has evidence', () => {
    const r = scoreLead(
      makeScoringInput({ websiteQuality: 'poor', features: { whatsapp: { status: 'no' } } }),
    );
    expect(r.breakdown.length).toBeGreaterThan(0);
    for (const b of r.breakdown) expect(b.evidence.length).toBeGreaterThan(0);
  });

  it('honours custom weights', () => {
    const weights = structuredClone(DEFAULT_SCORING_WEIGHTS);
    weights.website.poor = 1;
    expect(
      scoreLead(makeScoringInput({ websiteQuality: 'poor' }), weights).categoryTotals.website,
    ).toBe(1);
  });
});
