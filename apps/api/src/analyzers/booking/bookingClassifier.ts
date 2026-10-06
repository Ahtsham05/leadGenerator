import type { BookingQuality, TriState } from '@lead/shared';
import { describeHit, findHit } from '../detectionContext.js';
import type { FormField, PageAssets } from '../html/extractAssets.js';
import {
  classifyFields,
  classifyForm,
  isContactForm,
  type FormTraits,
} from '../html/formClassifier.js';
import { BOOKING_PLATFORMS, type BookingPlatform } from './bookingPlatforms.js';

export interface InspectedPage {
  url: string;
  role: 'homepage' | 'booking' | 'contact';
  assets: PageAssets;
  /** Child frames that were successfully inspected. */
  frames: PageAssets[];
  /** Child frame URLs that could not be inspected (timeout, crashed, blocked). */
  uninspectableFrames: string[];
  loginWall: boolean;
}

export interface BookingObservation {
  /** False when the homepage could not be inspected at all. */
  homepageInspected: boolean;
  homepageBlocked: boolean;
  homepageError: string | null;
  /** True when every page we intended to inspect was inspected (homepage rendered + booking links). */
  complete: boolean;
  pages: InspectedPage[];
}

export interface BookingClassification {
  status: TriState;
  bookingQuality: BookingQuality;
  evidence: string;
  platforms: string[];
  bookingUrl: string | null;
}

const PRICE_RE =
  /(?:[$£€]\s?\d{2,5}(?:[.,]\d{2})?\s*(?:\/|per)\s*(?:day|night|week|hr|hour))|(?:\b(?:total|subtotal|estimated total)\b[^.]{0,30}[$£€]\s?\d)/i;
const SELECT_VEHICLE_RE =
  /^(?:select|choose|book this|book now|reserve(?: now)?|rent (?:this|now))\b/i;

interface PageEvidence {
  url: string;
  traits: FormTraits;
  source: 'form' | 'fields';
}

function traitsOnPage(page: InspectedPage): PageEvidence[] {
  const out: PageEvidence[] = [];
  for (const a of [page.assets, ...page.frames]) {
    for (const f of a.forms) out.push({ url: page.url, traits: classifyForm(f), source: 'form' });
    if (a.looseFields.length > 0) {
      out.push({
        url: page.url,
        traits: classifyFields(
          a.looseFields as FormField[],
          a.bodyText.slice(0, 2000).toLowerCase(),
        ),
        source: 'fields',
      });
    }
  }
  return out;
}

function vehicleChoiceOnPage(page: InspectedPage): boolean {
  const buttons = [page.assets, ...page.frames].flatMap((a) => [
    ...a.buttonsText,
    ...a.anchors.map((x) => x.text),
  ]);
  return buttons.filter((t) => SELECT_VEHICLE_RE.test(t)).length >= 2;
}

function priceOnPage(page: InspectedPage): boolean {
  return [page.assets, ...page.frames].some((a) => PRICE_RE.test(a.bodyText));
}

function describeTraits(t: FormTraits): string {
  return [
    t.hasDate && 'date',
    t.hasPickupReturnLocation && 'pickup/return location',
    t.hasVehicleSelection && 'vehicle selection',
    (t.hasName || t.hasEmail || t.hasPhone) && 'customer detail',
    t.hasPaymentFields && 'payment',
  ]
    .filter(Boolean)
    .join(', ');
}

const yesNo = (q: BookingQuality): TriState =>
  q === 'none' ? 'no' : q === 'unknown' ? 'unknown' : 'yes';

function result(
  bookingQuality: BookingQuality,
  evidence: string,
  platforms: string[],
  bookingUrl: string | null,
): BookingClassification {
  return { status: yesNo(bookingQuality), bookingQuality, evidence, platforms, bookingUrl };
}

/**
 * Pure booking classification from inspected pages.
 *  none:    complete inspection, no booking path (only call / contact)
 *  basic:   request or quote form, or an appointment scheduler; no live availability
 *  good:    live availability with dates + vehicle selection + customer details or payment,
 *           or a known live rental engine / marketplace
 *  unknown: blocked, login required, uninspectable frames, or incomplete inspection
 */
export function classifyBooking(
  obs: BookingObservation,
  platforms: BookingPlatform[] = BOOKING_PLATFORMS,
): BookingClassification {
  if (obs.homepageBlocked)
    return result(
      'unknown',
      `Homepage blocked automated inspection${obs.homepageError ? `: ${obs.homepageError}` : ''}`,
      [],
      null,
    );
  if (!obs.homepageInspected)
    return result(
      'unknown',
      `Homepage could not be inspected${obs.homepageError ? `: ${obs.homepageError}` : ''}`,
      [],
      null,
    );

  // 1. Known platforms anywhere (scripts, iframes, links).
  const found: Array<{ platform: BookingPlatform; evidence: string; url: string }> = [];
  for (const page of obs.pages) {
    for (const assets of [page.assets, ...page.frames]) {
      for (const platform of platforms) {
        if (found.some((f) => f.platform.name === platform.name)) continue;
        const hit = findHit(
          { static: assets, staticComplete: true, rendered: null },
          platform.patterns,
        );
        if (hit) found.push({ platform, evidence: describeHit(hit), url: page.url });
      }
    }
  }
  const platformNames = found.map((f) => f.platform.name);
  const live = found.find((f) => f.platform.tier === 'live' || f.platform.tier === 'marketplace');
  if (live) {
    const where =
      live.platform.tier === 'marketplace' ? ' (third-party marketplace, off-site)' : '';
    return result(
      'good',
      `${live.platform.name} booking platform${where}: ${live.evidence}`,
      platformNames,
      live.url,
    );
  }

  // 2. Native booking forms.
  const evidence = obs.pages.flatMap(traitsOnPage);
  const vehicleChoice = obs.pages.filter((p) => p.role === 'booking').some(vehicleChoiceOnPage);
  const priceShown = obs.pages.some(priceOnPage);
  const bookingForms = evidence.filter(
    (e) =>
      !e.traits.isLogin &&
      !e.traits.isSearch &&
      !e.traits.isNewsletter &&
      (e.traits.hasDate || e.traits.hasPickupReturnLocation),
  );
  // A "request a quote" style form (quote wording or a free-text message box) only collects
  // a request; it counts as live booking only if it also shows prices or takes payment.
  const isRequestStyle = (t: FormTraits) => t.hasQuoteWording || t.hasMessage;
  const good = bookingForms.find(
    (e) =>
      e.traits.hasDate &&
      (e.traits.hasVehicleSelection || vehicleChoice) &&
      (e.traits.hasName || e.traits.hasEmail || e.traits.hasPhone || e.traits.hasPaymentFields) &&
      (!isRequestStyle(e.traits) || e.traits.hasPaymentFields || priceShown),
  );
  if (good) {
    const extras = [
      vehicleChoice && !good.traits.hasVehicleSelection && 'vehicle choice buttons',
      priceShown && 'prices shown',
    ].filter(Boolean);
    return result(
      'good',
      `Booking form on ${good.url} with ${describeTraits(good.traits)} fields${extras.length ? ` plus ${extras.join(' and ')}` : ''}`,
      platformNames,
      good.url,
    );
  }

  const scheduler = found.find((f) => f.platform.tier === 'scheduler');
  if (scheduler) {
    return result(
      'basic',
      `${scheduler.platform.name} scheduler (no vehicle selection): ${scheduler.evidence}`,
      platformNames,
      scheduler.url,
    );
  }
  const basicForm =
    bookingForms[0] ??
    evidence.find(
      (e) => isContactForm(e.traits) && (e.traits.hasBookingWording || e.traits.hasQuoteWording),
    );
  if (basicForm) {
    return result(
      'basic',
      `Request/quote form on ${basicForm.url} with ${describeTraits(basicForm.traits) || 'contact'} fields; no live availability found`,
      platformNames,
      basicForm.url,
    );
  }

  // 3. Nothing found: only claim "none" when inspection was complete and nothing was hidden from us.
  const bookingPages = obs.pages.filter((p) => p.role === 'booking');
  const loginWalled = bookingPages.find((p) => p.loginWall);
  if (loginWalled)
    return result(
      'unknown',
      `Booking page ${loginWalled.url} requires login`,
      platformNames,
      loginWalled.url,
    );
  const opaque = obs.pages.find((p) => p.uninspectableFrames.length > 0 && p.role !== 'contact');
  if (opaque) {
    return result(
      'unknown',
      `Embedded frame(s) on ${opaque.url} could not be inspected: ${opaque.uninspectableFrames.slice(0, 2).join(', ')}`,
      platformNames,
      opaque.url,
    );
  }
  if (!obs.complete)
    return result(
      'unknown',
      'Not all candidate booking pages could be inspected',
      platformNames,
      null,
    );
  const scope =
    bookingPages.length > 0
      ? `homepage and ${bookingPages.length} booking-related page(s)`
      : 'homepage (no booking links found)';
  return result(
    'none',
    `No online booking or quote form found on the ${scope}; only call or contact options`,
    platformNames,
    null,
  );
}
