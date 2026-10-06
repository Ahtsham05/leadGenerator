import type { Priority, WebsiteQuality } from '../enums.js';
import type { Features, Performance, ScoreBreakdownItem } from '../lead.js';
import { DEFAULT_SCORING_WEIGHTS, type ScoringWeights } from './weights.js';

/** The subset of a lead the scoring engine needs. A full Lead satisfies it. */
export interface ScoringInput {
  businessName: string;
  types: string[];
  primaryType: string | null;
  rating: number | null;
  reviewCount: number | null;
  instagramUrl: string | null;
  websiteQuality: WebsiteQuality;
  performance: Pick<Performance, 'performanceStatus' | 'mobileScore' | 'lcpMs' | 'cls'>;
  features: Pick<
    Features,
    'onlineBooking' | 'whatsapp' | 'chatbot' | 'onlinePayment' | 'contactForm' | 'automatedFollowUp'
  >;
}

export interface ScoreResult {
  score: number;
  priority: Priority;
  breakdown: ScoreBreakdownItem[];
  /** 0..1: share of scoring signals that were known (not "unknown"). */
  confidence: number;
  notes: string[];
  categoryTotals: Record<ScoreCategory, number>;
}

export type ScoreCategory = 'website' | 'performance' | 'booking' | 'automation' | 'attractiveness';

type Item = Omit<ScoreBreakdownItem, 'category'>;

/**
 * Applies the category cap. When it bites, a negative adjustment item is appended so the
 * breakdown always sums exactly to the final score.
 */
function capCategory(items: Item[], max: number, category: ScoreCategory, notes: string[]): Item[] {
  const raw = items.reduce((s, i) => s + i.points, 0);
  if (raw <= max) return items;
  notes.push(`${category} points capped at ${max} (raw ${raw}).`);
  return [
    ...items,
    { rule: `${category}.cap`, points: max - raw, evidence: `Category maximum is ${max}` },
  ];
}

export function priorityFor(
  score: number,
  weights: ScoringWeights = DEFAULT_SCORING_WEIGHTS,
): Priority {
  if (score >= weights.priority.hot) return 'hot';
  if (score >= weights.priority.high) return 'high';
  if (score >= weights.priority.medium) return 'medium';
  return 'low';
}

function websiteRules(input: ScoringInput, w: ScoringWeights): Item[] {
  const points = w.website[input.websiteQuality];
  const evidence =
    input.websiteQuality === 'none'
      ? 'No website on record for this business'
      : `Website quality classified as "${input.websiteQuality}"`;
  return points > 0 ? [{ rule: `website.${input.websiteQuality}`, points, evidence }] : [];
}

function performanceRules(input: ScoringInput, w: ScoringWeights, notes: string[]): Item[] {
  const p = input.performance;
  if (p.performanceStatus !== 'ok' || p.mobileScore === null) {
    notes.push('Performance data unavailable; performance category scored 0.');
    return [];
  }
  const items: Item[] = [];
  const band = w.performance.mobileBands.find(
    (b) => p.mobileScore !== null && p.mobileScore < b.below,
  );
  if (band && band.points > 0) {
    items.push({
      rule: `performance.mobileScoreBelow${band.below}`,
      points: band.points,
      evidence: `PageSpeed mobile score ${p.mobileScore}/100`,
    });
  }
  const { lcp, cls } = w.performance;
  if (p.lcpMs !== null) {
    if (p.lcpMs > lcp.severeAboveMs) {
      items.push({
        rule: 'performance.lcpSevere',
        points: lcp.severePoints,
        evidence: `Mobile LCP ${Math.round(p.lcpMs)} ms`,
      });
    } else if (p.lcpMs >= lcp.moderateFromMs) {
      items.push({
        rule: 'performance.lcpModerate',
        points: lcp.moderatePoints,
        evidence: `Mobile LCP ${Math.round(p.lcpMs)} ms`,
      });
    }
  }
  if (p.cls !== null) {
    if (p.cls > cls.severeAbove) {
      items.push({
        rule: 'performance.clsSevere',
        points: cls.severePoints,
        evidence: `Mobile CLS ${p.cls.toFixed(3)}`,
      });
    } else if (p.cls >= cls.moderateFrom) {
      items.push({
        rule: 'performance.clsModerate',
        points: cls.moderatePoints,
        evidence: `Mobile CLS ${p.cls.toFixed(3)}`,
      });
    }
  }
  return items;
}

function bookingRules(input: ScoringInput, w: ScoringWeights): Item[] {
  const b = input.features.onlineBooking;
  const evidence = b.evidence ?? `Booking classified as "${b.bookingQuality}"`;
  const items: Item[] = [];
  switch (b.bookingQuality) {
    case 'none':
      items.push({ rule: 'booking.none', points: w.booking.none, evidence });
      if (input.features.contactForm.status === 'no') {
        items.push({
          rule: 'booking.noneAndNoContactForm',
          points: w.booking.noneAndNoContactFormBonus,
          evidence: input.features.contactForm.evidence ?? 'No contact form found',
        });
      }
      break;
    case 'basic':
      items.push({ rule: 'booking.basic', points: w.booking.basic, evidence });
      break;
    case 'good':
      items.push({ rule: 'booking.good', points: w.booking.good, evidence });
      break;
    case 'unknown':
      items.push({
        rule: 'booking.unknown',
        points: w.booking.unknown,
        evidence: b.evidence ?? 'Booking capability could not be determined',
      });
      break;
  }
  return items.filter((i) => i.points > 0);
}

function automationRules(input: ScoringInput, w: ScoringWeights): Item[] {
  const f = input.features;
  const gaps: Array<[keyof typeof f, string, number, string]> = [
    [
      'whatsapp',
      'automation.noWhatsapp',
      w.automation.noWhatsapp,
      'No WhatsApp link or widget found',
    ],
    ['chatbot', 'automation.noChatbot', w.automation.noChatbot, 'No chat widget found'],
    [
      'onlinePayment',
      'automation.noOnlinePayment',
      w.automation.noOnlinePayment,
      'No online payment provider found',
    ],
    [
      'automatedFollowUp',
      'automation.noAutomatedFollowUp',
      w.automation.noAutomatedFollowUp,
      'No marketing automation or CRM signatures found',
    ],
  ];
  // A gap counts only when the signal is a proven "no", never "unknown".
  return gaps
    .filter(([key]) => f[key].status === 'no')
    .map(([key, rule, points, fallback]) => ({
      rule,
      points,
      evidence: f[key].evidence ?? fallback,
    }))
    .filter((i) => i.points > 0);
}

function attractivenessRules(input: ScoringInput, w: ScoringWeights): Item[] {
  const a = w.attractiveness;
  const items: Item[] = [];
  const haystack = [input.businessName, input.primaryType ?? '', ...input.types]
    .join(' ')
    .toLowerCase()
    .replace(/_/g, ' ');
  const keyword = a.luxuryKeywords.find((k) => haystack.includes(k.toLowerCase()));
  if (keyword) {
    items.push({
      rule: 'attractiveness.luxuryKeyword',
      points: a.luxuryKeywordPoints,
      evidence: `Name or type contains "${keyword}"`,
    });
  }
  if (input.reviewCount !== null) {
    if (input.reviewCount >= a.reviewsTier2.min) {
      items.push({
        rule: 'attractiveness.reviewsTier2',
        points: a.reviewsTier2.points,
        evidence: `${input.reviewCount} Google reviews`,
      });
    } else if (input.reviewCount >= a.reviewsTier1.min) {
      items.push({
        rule: 'attractiveness.reviewsTier1',
        points: a.reviewsTier1.points,
        evidence: `${input.reviewCount} Google reviews`,
      });
    }
  }
  if (input.rating !== null && input.rating >= a.highRating.min) {
    items.push({
      rule: 'attractiveness.highRating',
      points: a.highRating.points,
      evidence: `Google rating ${input.rating}`,
    });
  }
  if (input.instagramUrl) {
    items.push({
      rule: 'attractiveness.instagram',
      points: a.instagramPoints,
      evidence: `Instagram profile linked from website: ${input.instagramUrl}`,
    });
  }
  return items.filter((i) => i.points > 0);
}

/** Share of the signals that drive scoring which are known. */
export function scoringConfidence(input: ScoringInput): number {
  const f = input.features;
  const known = [
    input.websiteQuality !== 'unknown',
    input.performance.performanceStatus === 'ok' && input.performance.mobileScore !== null,
    f.onlineBooking.bookingQuality !== 'unknown',
    f.whatsapp.status !== 'unknown',
    f.chatbot.status !== 'unknown',
    f.onlinePayment.status !== 'unknown',
    f.contactForm.status !== 'unknown',
    f.automatedFollowUp.status !== 'unknown',
    input.reviewCount !== null,
    input.rating !== null,
  ];
  return Math.round((known.filter(Boolean).length / known.length) * 100) / 100;
}

/**
 * Pure scoring function. Deterministic: same input and weights => same output.
 */
export function scoreLead(
  input: ScoringInput,
  weights: ScoringWeights = DEFAULT_SCORING_WEIGHTS,
): ScoreResult {
  const notes: string[] = [];
  const categories: Array<[ScoreCategory, Item[], number]> = [
    ['website', websiteRules(input, weights), weights.website.max],
    ['performance', performanceRules(input, weights, notes), weights.performance.max],
    ['booking', bookingRules(input, weights), weights.booking.max],
    ['automation', automationRules(input, weights), weights.automation.max],
    ['attractiveness', attractivenessRules(input, weights), weights.attractiveness.max],
  ];

  const breakdown: ScoreBreakdownItem[] = [];
  const categoryTotals = {} as Record<ScoreCategory, number>;
  let score = 0;
  for (const [category, rawItems, max] of categories) {
    const items = capCategory(rawItems, max, category, notes);
    const total = items.reduce((s, i) => s + i.points, 0);
    categoryTotals[category] = total;
    score += total;
    for (const item of items) breakdown.push({ ...item, category });
  }
  score = Math.max(0, Math.min(100, Math.round(score)));

  return {
    score,
    priority: priorityFor(score, weights),
    breakdown,
    confidence: scoringConfidence(input),
    notes,
    categoryTotals,
  };
}
