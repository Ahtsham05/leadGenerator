import { emptyFeatures, type Features } from '@lead/shared';
import { normalizeUrl } from './net/urlSafety.js';

export type WebsiteResolution =
  { hasWebsite: true; url: string } | { hasWebsite: false; reason: string; invalidInput?: string };

/**
 * Decides whether a lead has a website we can analyse. We never guess or search for
 * a website: if none is on record, the lead is classified as having no website.
 */
export function resolveWebsite(website: string | null | undefined): WebsiteResolution {
  if (!website || !website.trim()) return { hasWebsite: false, reason: 'No website on record' };
  const norm = normalizeUrl(website);
  if (!norm.ok)
    return {
      hasWebsite: false,
      reason: `Website on record is not usable: ${norm.error}`,
      invalidInput: website,
    };
  return { hasWebsite: true, url: norm.url.toString() };
}

/**
 * Feature signals for a lead with no website. Only facts implied by having no site
 * are set; everything that could exist off-site (WhatsApp, payments) stays unknown.
 */
export function featuresWithoutWebsite(): Features {
  const f = emptyFeatures();
  const evidence = 'No website on record';
  f.onlineBooking = {
    status: 'no',
    evidence,
    bookingQuality: 'none',
    platforms: [],
    bookingUrl: null,
  };
  f.contactForm = { status: 'no', evidence };
  f.chatbot = { status: 'no', evidence, chatbotProvider: null };
  f.liveChat = { status: 'no', evidence };
  f.aiAssistant = { status: 'notDetected', evidence };
  return f;
}
