import type { WebsiteQuality } from '../enums.js';
import type { Features, Opportunity, Performance, Technology } from '../lead.js';
import { getNicheProfile, type NicheProfile } from '../niche.js';

export interface OpportunityInput {
  website: string | null;
  websiteQuality: WebsiteQuality;
  isHttps: boolean | null;
  isMobileFriendly: boolean | null;
  technology: Pick<Technology, 'cms' | 'builder'>;
  performance: Pick<Performance, 'performanceStatus' | 'mobileScore' | 'lcpMs'>;
  features: Features;
}

const SLOW_MOBILE_BELOW = 50;
/** Platforms where a rebuild is the natural pitch (template builders and classic CMSs). */
const REBUILD_PLATFORMS = ['wordpress', 'wix', 'godaddy', 'squarespace', 'weebly', 'joomla'];

/** "WordPress (Elementor)", "Wix", "WordPress"... */
function platformOf(input: OpportunityInput): string | null {
  const { cms, builder } = input.technology;
  if (cms && builder) return `${cms} (${builder})`;
  return builder ?? cms;
}

/**
 * Pure mapping from verified signals to sellable opportunities.
 * Every opportunity lists the evidence strings that justify it; opportunities are
 * only produced from proven signals ("unknown" never produces a claim).
 */
export function buildOpportunities(
  input: OpportunityInput,
  niche: NicheProfile = getNicheProfile(undefined),
): Opportunity[] {
  const out: Opportunity[] = [];
  const f = input.features;
  const booking = f.onlineBooking;
  const noLiveBooking = booking.bookingQuality === 'none' || booking.bookingQuality === 'basic';
  const perfOk =
    input.performance.performanceStatus === 'ok' && input.performance.mobileScore !== null;
  const slowMobile = perfOk && (input.performance.mobileScore ?? 100) < SLOW_MOBILE_BELOW;
  const platform = platformOf(input);
  const onRebuildPlatform =
    platform !== null && REBUILD_PLATFORMS.some((p) => platform.toLowerCase().includes(p));

  // 1. Website / booking
  if (!input.website || input.websiteQuality === 'none') {
    out.push({
      title: `Professional ${niche.serviceNoun} website with online booking`,
      serviceType: 'website',
      reason: 'The business has no website on record, so customers cannot browse or book online.',
      evidence: ['No website on record for this business'],
    });
  } else if (
    noLiveBooking &&
    (slowMobile || input.websiteQuality === 'poor' || onRebuildPlatform)
  ) {
    const evidence = [booking.evidence ?? `Booking classified as "${booking.bookingQuality}"`];
    if (slowMobile) evidence.push(`PageSpeed mobile score ${input.performance.mobileScore}/100`);
    if (platform) evidence.push(`Site built with ${platform}`);
    if (input.websiteQuality === 'poor') evidence.push('Website quality classified as "poor"');
    out.push({
      title: `Modern ${niche.serviceNoun} website with online booking`,
      serviceType: 'website',
      reason:
        booking.bookingQuality === 'none'
          ? 'No online booking path was found and the current site would benefit from a rebuild.'
          : 'Only a request or quote form was found (no live availability) and the current site would benefit from a rebuild.',
      evidence,
    });
  } else if (noLiveBooking) {
    out.push({
      title: 'Online booking system with live availability',
      serviceType: 'booking',
      reason:
        booking.bookingQuality === 'none'
          ? 'No online booking path was found on the analysed pages.'
          : 'Bookings appear to go through a request form without live availability.',
      evidence: [booking.evidence ?? `Booking classified as "${booking.bookingQuality}"`],
    });
  } else if (slowMobile) {
    out.push({
      title: 'Mobile speed and Core Web Vitals improvement',
      serviceType: 'performance',
      reason: 'The site is slow on mobile, which costs conversions from mobile visitors.',
      evidence: [
        `PageSpeed mobile score ${input.performance.mobileScore}/100`,
        ...(input.performance.lcpMs !== null
          ? [`Mobile LCP ${Math.round(input.performance.lcpMs)} ms`]
          : []),
      ],
    });
  }

  // 2. WhatsApp
  if (f.whatsapp.status === 'no') {
    out.push({
      title: 'WhatsApp inquiry and follow up automation',
      serviceType: 'whatsapp',
      reason: 'Customers have no one-tap WhatsApp channel from the website.',
      evidence: [f.whatsapp.evidence ?? 'No WhatsApp link or widget found'],
    });
  }

  // 3. AI assistant
  if (f.chatbot.status === 'no') {
    out.push({
      title: `AI assistant for ${niche.faqPhrase}`,
      serviceType: 'aiAssistant',
      reason:
        'No chat widget was found on the site, so visitors can only get answers by calling, messaging or filling in a form.',
      evidence: [f.chatbot.evidence ?? 'No chat widget found'],
    });
  } else if (
    f.chatbot.status === 'yes' &&
    f.aiAssistant.status === 'unknown' &&
    f.chatbot.chatbotProvider
  ) {
    out.push({
      title: 'AI answers for the existing chat widget',
      serviceType: 'aiAssistant',
      reason: `A ${f.chatbot.chatbotProvider} widget is installed; whether it uses AI is not known, so this is a question to ask, not a claim.`,
      evidence: [f.chatbot.evidence ?? `${f.chatbot.chatbotProvider} widget detected`],
    });
  }

  // 4. Payments
  if (f.onlinePayment.status === 'no' && booking.bookingQuality !== 'good') {
    out.push({
      title: 'Online deposits and payments',
      serviceType: 'payments',
      reason: 'No online payment provider or card fields were detected on the analysed pages.',
      evidence: [f.onlinePayment.evidence ?? 'No online payment provider found'],
    });
  }

  // 5. Follow up automation for inbound forms
  if (f.contactForm.status === 'yes' && f.automatedFollowUp.status === 'no') {
    out.push({
      title: 'Automated follow up for form inquiries',
      serviceType: 'automation',
      reason:
        'The site collects inquiries through a form but shows no marketing automation or CRM tooling.',
      evidence: [
        f.contactForm.evidence ?? 'Contact form found',
        f.automatedFollowUp.evidence ?? 'No marketing automation or CRM signatures found',
      ],
    });
  }

  return out;
}
