import { z } from 'zod';

/**
 * Every tunable number used by the scoring engine lives here.
 * The schema is used to validate edited weights (e.g. from the Settings screen).
 * Category maxima must sum to 100.
 */
const nonNeg = z.number().min(0);

export const ScoringWeightsSchema = z
  .object({
    website: z.object({
      max: nonNeg,
      none: nonNeg,
      poor: nonNeg,
      average: nonNeg,
      good: nonNeg,
      excellent: nonNeg,
      unknown: nonNeg,
    }),
    performance: z.object({
      max: nonNeg,
      /** Ordered ascending; the first band whose `below` exceeds the mobile score wins. */
      mobileBands: z.array(z.object({ below: z.number(), points: nonNeg })).min(1),
      lcp: z.object({
        severeAboveMs: nonNeg,
        severePoints: nonNeg,
        moderateFromMs: nonNeg,
        moderatePoints: nonNeg,
      }),
      cls: z.object({
        severeAbove: nonNeg,
        severePoints: nonNeg,
        moderateFrom: nonNeg,
        moderatePoints: nonNeg,
      }),
    }),
    booking: z.object({
      max: nonNeg,
      none: nonNeg,
      noneAndNoContactFormBonus: nonNeg,
      basic: nonNeg,
      good: nonNeg,
      unknown: nonNeg,
    }),
    automation: z.object({
      max: nonNeg,
      noWhatsapp: nonNeg,
      noChatbot: nonNeg,
      noOnlinePayment: nonNeg,
      noAutomatedFollowUp: nonNeg,
    }),
    attractiveness: z.object({
      max: nonNeg,
      luxuryKeywordPoints: nonNeg,
      luxuryKeywords: z.array(z.string().min(1)),
      reviewsTier1: z.object({ min: nonNeg, points: nonNeg }),
      /** Replaces tier 1 (not additive). */
      reviewsTier2: z.object({ min: nonNeg, points: nonNeg }),
      highRating: z.object({ min: nonNeg, points: nonNeg }),
      instagramPoints: nonNeg,
    }),
    priority: z.object({
      hot: nonNeg,
      high: nonNeg,
      medium: nonNeg,
    }),
  })
  .refine(
    (w) =>
      w.website.max +
        w.performance.max +
        w.booking.max +
        w.automation.max +
        w.attractiveness.max ===
      100,
    { message: 'Category maxima must sum to 100' },
  )
  .refine((w) => w.priority.hot > w.priority.high && w.priority.high > w.priority.medium, {
    message: 'Priority thresholds must be strictly descending (hot > high > medium)',
  });

export type ScoringWeights = z.infer<typeof ScoringWeightsSchema>;

export const DEFAULT_SCORING_WEIGHTS: ScoringWeights = {
  website: { max: 30, none: 30, poor: 25, average: 12, good: 3, excellent: 0, unknown: 10 },
  performance: {
    max: 20,
    mobileBands: [
      { below: 30, points: 10 },
      { below: 50, points: 8 },
      { below: 65, points: 5 },
      { below: 80, points: 2 },
    ],
    lcp: { severeAboveMs: 4000, severePoints: 6, moderateFromMs: 2500, moderatePoints: 3 },
    cls: { severeAbove: 0.25, severePoints: 4, moderateFrom: 0.1, moderatePoints: 2 },
  },
  booking: { max: 20, none: 15, noneAndNoContactFormBonus: 5, basic: 8, good: 2, unknown: 6 },
  automation: {
    max: 15,
    noWhatsapp: 5,
    noChatbot: 4,
    noOnlinePayment: 3,
    noAutomatedFollowUp: 3,
  },
  attractiveness: {
    max: 15,
    luxuryKeywordPoints: 5,
    luxuryKeywords: [
      'luxury',
      'exotic',
      'prestige',
      'premium',
      'supercar',
      'super car',
      'vip',
      'elite',
      'lamborghini',
      'ferrari',
      'rolls royce',
      'rolls-royce',
      'bentley',
      'mclaren',
      'porsche',
    ],
    reviewsTier1: { min: 100, points: 3 },
    reviewsTier2: { min: 500, points: 5 },
    highRating: { min: 4.3, points: 2 },
    instagramPoints: 3,
  },
  priority: { hot: 80, high: 60, medium: 40 },
};
