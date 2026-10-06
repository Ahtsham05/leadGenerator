import type { BookingQuality, WebsiteQuality } from '@lead/shared';

export interface QualityInput {
  hasWebsite: boolean;
  /** Homepage could be fetched or rendered. */
  reachable: boolean;
  isHttps: boolean | null;
  hasViewportMeta: boolean | null;
  horizontalOverflowPx: number | null;
  mobileScore: number | null;
  copyrightYear: number | null;
  builder: string | null;
  cms: string | null;
  framework: string | null;
  bookingQuality: BookingQuality;
  /** Text of a clear call to action, or null when none found; undefined when unknown. */
  callToAction: string | null | undefined;
  now?: Date;
}

export interface QualityResult {
  websiteQuality: WebsiteQuality;
  qualityReasons: string[];
  isMobileFriendly: boolean | null;
  /** Internal score, exposed for tests and transparency. */
  points: number;
}

/** Template builders whose sites are typically dated. */
const DATED_BUILDERS = ['GoDaddy Website Builder', 'Weebly'];
const MODERN_FRAMEWORKS = ['Next.js', 'Nuxt', 'Gatsby'];

/**
 * Deterministic combination of signals into a quality rating. No LLM involved.
 * Thresholds: <= -5 poor, -4..-1 average, 0..2 good, >= 3 excellent (needs mobile >= 80).
 * Fewer than 3 known signals => "unknown".
 */
export function classifyWebsiteQuality(input: QualityInput): QualityResult {
  if (!input.hasWebsite) {
    return {
      websiteQuality: 'none',
      qualityReasons: ['No website on record'],
      isMobileFriendly: null,
      points: 0,
    };
  }
  if (!input.reachable) {
    return {
      websiteQuality: 'unknown',
      qualityReasons: ['Website could not be fetched or rendered'],
      isMobileFriendly: null,
      points: 0,
    };
  }
  const reasons: string[] = [];
  let points = 0;
  let known = 0;
  const add = (delta: number, reason: string) => {
    points += delta;
    reasons.push(`${reason} (${delta > 0 ? '+' : ''}${delta})`);
  };

  if (input.isHttps !== null) {
    known++;
    if (!input.isHttps) add(-2, 'Not served over HTTPS');
  }

  let isMobileFriendly: boolean | null = null;
  if (input.hasViewportMeta === false) {
    known++;
    isMobileFriendly = false;
    add(-3, 'No responsive viewport meta tag');
  } else if (input.hasViewportMeta === true && input.horizontalOverflowPx !== null) {
    known++;
    if (input.horizontalOverflowPx > 8) {
      isMobileFriendly = false;
      add(-2, `Content overflows horizontally by ${input.horizontalOverflowPx}px at 390px width`);
    } else {
      isMobileFriendly = true;
    }
  }

  if (input.mobileScore !== null) {
    known++;
    const s = input.mobileScore;
    if (s < 30) add(-3, `Very slow on mobile: PageSpeed ${s}/100`);
    else if (s < 50) add(-2, `Slow on mobile: PageSpeed ${s}/100`);
    else if (s < 65) add(-1, `Below-average mobile speed: PageSpeed ${s}/100`);
    else if (s >= 90) add(2, `Fast on mobile: PageSpeed ${s}/100`);
    else if (s >= 80) add(1, `Good mobile speed: PageSpeed ${s}/100`);
  }

  if (input.copyrightYear !== null) {
    known++;
    const age = (input.now ?? new Date()).getFullYear() - input.copyrightYear;
    if (age >= 5)
      add(
        -2,
        `Copyright year ${input.copyrightYear} suggests the site has not been updated recently`,
      );
    else if (age >= 3) add(-1, `Copyright year ${input.copyrightYear}`);
  }

  if (input.builder && DATED_BUILDERS.includes(input.builder))
    add(-1, `Built with ${input.builder}, a dated template builder`);
  if (input.framework && MODERN_FRAMEWORKS.includes(input.framework))
    add(1, `Built with ${input.framework}`);

  if (input.bookingQuality !== 'unknown') {
    known++;
    if (input.bookingQuality === 'good') add(2, 'Online booking with live availability');
    else if (input.bookingQuality === 'none') add(-1, 'No online booking path');
  }

  if (input.callToAction !== undefined) {
    known++;
    if (input.callToAction === null) add(-1, 'No clear call to action found');
    else add(1, 'Clear call to action present');
  }

  if (known < 3) {
    return {
      websiteQuality: 'unknown',
      qualityReasons: [...reasons, `Only ${known} quality signal(s) available`],
      isMobileFriendly,
      points,
    };
  }
  let websiteQuality: WebsiteQuality;
  if (points <= -5) websiteQuality = 'poor';
  else if (points <= -1) websiteQuality = 'average';
  else if (points >= 3 && (input.mobileScore ?? 0) >= 80) websiteQuality = 'excellent';
  else websiteQuality = 'good';
  return { websiteQuality, qualityReasons: reasons, isMobileFriendly, points };
}
