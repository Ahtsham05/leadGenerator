import type { SourcePatterns } from '../detectionContext.js';

/**
 * Booking / rental platforms detected by script, iframe or link.
 * tier:
 *  - live: vehicle/equipment rental engine with live availability   => "good"
 *  - marketplace: third-party marketplace listing with live booking  => "good" (off-site)
 *  - scheduler: appointment scheduler (availability but no vehicle selection) => "basic"
 */
export interface BookingPlatform {
  name: string;
  tier: 'live' | 'marketplace' | 'scheduler';
  patterns: SourcePatterns;
}

const p = (...res: RegExp[]): SourcePatterns => ({
  scriptSrc: res,
  iframeSrc: res,
  anchorHref: res,
});

export const BOOKING_PLATFORMS: BookingPlatform[] = [
  { name: 'Rent Centric', tier: 'live', patterns: p(/rentcentric\.com/i) },
  { name: 'RentWorks', tier: 'live', patterns: p(/rentworks\.com/i, /rwonline\./i) },
  {
    name: 'HQ Rental Software',
    tier: 'live',
    patterns: p(/hqrentalsoftware\.com/i, /caagcrm\.com/i),
  },
  { name: 'Navotar', tier: 'live', patterns: p(/navotar\.com/i) },
  { name: 'Rentsyst', tier: 'live', patterns: p(/rentsyst\.com/i) },
  { name: 'Easy Rent Pro', tier: 'live', patterns: p(/easyrentpro\.com/i) },
  { name: 'Rently', tier: 'live', patterns: p(/rently\.com/i) },
  {
    name: 'Booqable',
    tier: 'live',
    patterns: { ...p(/booqable\.com/i), html: [/booqable-(?:product|cart)/i] },
  },
  { name: 'Wheelbase', tier: 'live', patterns: p(/wheelbasepro\.com/i) },
  { name: 'Checkfront', tier: 'live', patterns: p(/checkfront\.com/i) },
  { name: 'FareHarbor', tier: 'live', patterns: p(/fareharbor\.com/i) },
  { name: 'Rezdy', tier: 'live', patterns: p(/rezdy\.com/i) },
  { name: 'Bookeo', tier: 'live', patterns: p(/bookeo\.com/i) },
  { name: 'Turo', tier: 'marketplace', patterns: p(/(?:^|\/\/|\.)turo\.com\//i) },
  { name: 'Rentcars', tier: 'marketplace', patterns: p(/(?:^|\/\/|\.)rentcars\.com\//i) },
  { name: 'Getaround', tier: 'marketplace', patterns: p(/(?:^|\/\/|\.)getaround\.com\//i) },
  { name: 'Outdoorsy', tier: 'marketplace', patterns: p(/(?:^|\/\/|\.)outdoorsy\.com\//i) },
  { name: 'Calendly', tier: 'scheduler', patterns: p(/calendly\.com\//i) },
  {
    name: 'Acuity Scheduling',
    tier: 'scheduler',
    patterns: p(
      /acuityscheduling\.com/i,
      /squarespacescheduling\.com/i,
      /(?:^|\/\/)[a-z0-9-]+\.as\.me\//i,
    ),
  },
  { name: 'TeamUp', tier: 'scheduler', patterns: p(/teamup\.com\//i) },
  { name: 'SimplyBook.me', tier: 'scheduler', patterns: p(/simplybook\.(?:me|it|asia)/i) },
  { name: 'Setmore', tier: 'scheduler', patterns: p(/setmore\.com/i) },
  {
    name: 'Square Appointments',
    tier: 'scheduler',
    patterns: p(/squareup\.com\/appointments/i, /square\.site\/book/i),
  },
];

/** Link text or href that suggests a booking path (spec list plus close variants). */
export const BOOKING_LINK_RE =
  /\b(?:book(?:ing)?|reserv(?:e|ation|ations)|availability|rent now|rent a car|get a quote|request a quote|check rates|checkout)\b/i;
export const BOOKING_HREF_RE = /book|reserv|availability|rent-?now|quote|check-?rates|checkout/i;
export const CONTACT_LINK_RE = /\bcontact\b/i;
