import type {
  AnalysisStatus,
  BookingQuality,
  LeadStatus,
  Priority,
  TriState,
  WebsiteQuality,
} from '@lead/shared';
import type { LeadDto } from './types';

export const PRIORITY_LABEL: Record<Priority, string> = {
  hot: 'Hot',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

export const PRIORITY_RANGE: Record<Priority, string> = {
  hot: '80 and up',
  high: '60 to 79',
  medium: '40 to 59',
  low: 'Below 40',
};

export const LEAD_STATUS_LABEL: Record<LeadStatus, string> = {
  new: 'New',
  reviewed: 'Reviewed',
  contacted: 'Contacted',
  replied: 'Replied',
  meeting: 'Meeting',
  won: 'Won',
  lost: 'Lost',
  doNotContact: 'Do not contact',
};

export const ANALYSIS_STATUS_LABEL: Record<AnalysisStatus, string> = {
  pending: 'Queued',
  analyzing: 'Analysing',
  completed: 'Complete',
  partial: 'Partial',
  failed: 'Failed',
  blocked: 'Blocked by site',
};

export const ANALYSIS_STATUS_HELP: Record<AnalysisStatus, string> = {
  pending: 'Waiting in the queue.',
  analyzing: 'The worker is inspecting the site now.',
  completed: 'Every stage finished.',
  partial: 'Some stages failed. The score uses what could be proven.',
  failed: 'The analysis could not finish. Check the log below.',
  blocked: 'The site refused or rate limited us. We never bypass blocks.',
};

export const BOOKING_LABEL: Record<BookingQuality, string> = {
  none: 'None',
  basic: 'Basic form',
  good: 'Live booking',
  unknown: 'Unknown',
};

export const TRI_LABEL: Record<TriState, string> = { yes: 'Yes', no: 'No', unknown: 'Unknown' };

export const QUALITY_LABEL: Record<WebsiteQuality, string> = {
  none: 'No website',
  poor: 'Poor',
  average: 'Average',
  good: 'Good',
  excellent: 'Excellent',
  unknown: 'Unknown',
};

export const SERVICE_LABEL: Record<string, string> = {
  website: 'Website',
  booking: 'Online booking',
  whatsapp: 'WhatsApp',
  aiAssistant: 'AI assistant',
  automation: 'Automation',
  payments: 'Payments',
  performance: 'Performance',
};

export const isActiveStatus = (s: AnalysisStatus): boolean => s === 'pending' || s === 'analyzing';

/**
 * Plain-language gaps taken only from proven signals. A signal that is `unknown` never
 * becomes a gap, matching the rule the analysis itself follows.
 */
export function weakPoints(lead: LeadDto): string[] {
  if (isActiveStatus(lead.analysisStatus) && lead.score === null) return [];
  const out: string[] = [];
  const q = lead.websiteQuality;
  if (q === 'none') out.push('No working website');
  else if (q === 'poor') out.push('Poor website');
  const mobile = lead.performance.mobileScore;
  if (mobile !== null && mobile < 50) out.push(`Slow on mobile (${mobile})`);
  if (lead.features.onlineBooking.bookingQuality === 'none') out.push('No online booking');
  else if (lead.features.onlineBooking.bookingQuality === 'basic') out.push('Basic booking form');
  if (lead.features.whatsapp.status === 'no') out.push('No WhatsApp');
  if (lead.features.chatbot.status === 'no') out.push('No chat widget');
  if (lead.features.onlinePayment.status === 'no') out.push('No online payment');
  return out;
}

export type VitalKey = 'lcp' | 'cls' | 'inp' | 'ttfb';
export type VitalRating = 'good' | 'needs-work' | 'poor';

const VITAL_LIMITS: Record<VitalKey, [good: number, poor: number]> = {
  lcp: [2500, 4000],
  cls: [0.1, 0.25],
  inp: [200, 500],
  ttfb: [800, 1800],
};

/** Google's published Core Web Vitals thresholds. */
export function rateVital(key: VitalKey, value: number | null): VitalRating | null {
  if (value === null) return null;
  const [good, poor] = VITAL_LIMITS[key];
  if (value <= good) return 'good';
  if (value > poor) return 'poor';
  return 'needs-work';
}

export function scoreBand(score: number | null): Priority | null {
  if (score === null) return null;
  if (score >= 80) return 'hot';
  if (score >= 60) return 'high';
  if (score >= 40) return 'medium';
  return 'low';
}

/** Group the breakdown by category and total it, keeping the order of first appearance. */
export function groupBreakdown(items: LeadDto['scoreBreakdown']) {
  const groups = new Map<string, { category: string; total: number; items: typeof items }>();
  for (const it of items) {
    const g = groups.get(it.category) ?? { category: it.category, total: 0, items: [] };
    g.total += it.points;
    g.items.push(it);
    groups.set(it.category, g);
  }
  return [...groups.values()];
}

export const isCapRule = (rule: string): boolean => rule.endsWith('.cap');

export const CATEGORY_LABEL: Record<string, string> = {
  website: 'Website',
  performance: 'Performance',
  booking: 'Booking',
  automation: 'Automation gaps',
  attractiveness: 'Business appeal',
};

export const CATEGORY_MAX: Record<string, number> = {
  website: 30,
  performance: 20,
  booking: 20,
  automation: 15,
  attractiveness: 15,
};
