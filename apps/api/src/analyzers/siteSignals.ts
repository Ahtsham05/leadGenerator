import type { TriState } from '@lead/shared';
import {
  describeHit,
  findHit,
  sourcesOf,
  type DetectionContext,
  type SourcePatterns,
} from './detectionContext.js';
import type { PageAssets } from './html/extractAssets.js';
import { classifyForm, isContactForm } from './html/formClassifier.js';
import { siteHost } from './net/urlSafety.js';

export interface Signal {
  status: TriState;
  evidence: string;
}

/** Embedded third-party form builders. */
const FORM_EMBEDS: Array<{ name: string; patterns: SourcePatterns }> = [
  {
    name: 'Jotform',
    patterns: {
      scriptSrc: [/jotform\.(?:com|us)\/jsform/i],
      iframeSrc: [/jotform\.(?:com|us)\//i],
    },
  },
  {
    name: 'Typeform',
    patterns: { scriptSrc: [/embed\.typeform\.com/i], iframeSrc: [/\.typeform\.com\/to\//i] },
  },
  { name: 'Google Forms', patterns: { iframeSrc: [/docs\.google\.com\/forms\//i] } },
  { name: 'Wufoo', patterns: { scriptSrc: [/wufoo\.com/i], iframeSrc: [/wufoo\.com/i] } },
  { name: 'HubSpot Forms', patterns: { scriptSrc: [/js\.hsforms\.net/i] } },
  {
    name: 'Formstack',
    patterns: { scriptSrc: [/formstack\.com\/forms/i], iframeSrc: [/formstack\.com\/forms/i] },
  },
  {
    name: 'Cognito Forms',
    patterns: { scriptSrc: [/cognitoforms\.com/i], iframeSrc: [/cognitoforms\.com/i] },
  },
  {
    name: '123FormBuilder',
    patterns: { scriptSrc: [/123formbuilder\.com/i], iframeSrc: [/123formbuilder\.com/i] },
  },
];

function findContactFormIn(pages: PageAssets[]): string | null {
  for (const p of pages) {
    for (const form of p.forms) {
      const t = classifyForm(form);
      if (isContactForm(t)) {
        const parts = [
          t.hasName && 'name',
          t.hasEmail && 'email',
          t.hasPhone && 'phone',
          t.hasMessage && 'message',
        ]
          .filter(Boolean)
          .join(', ');
        return `Form with ${parts} fields on ${p.url}`;
      }
    }
  }
  return null;
}

export interface ContactCoverage {
  /** Whether a contact page link was found and then inspected. null = no contact link exists. */
  contactPageInspected: boolean | null;
}

/**
 * Contact form on the homepage or the contact page. "no" requires the rendered homepage
 * and (if the site links to one) the rendered contact page.
 */
export function detectContactForm(ctx: DetectionContext, coverage: ContactCoverage): Signal {
  const pages = sourcesOf(ctx).map((s) => s.assets);
  const native = findContactFormIn(pages);
  if (native) return { status: 'yes', evidence: native };
  for (const embed of FORM_EMBEDS) {
    const hit = findHit(ctx, embed.patterns);
    if (hit) return { status: 'yes', evidence: `${embed.name} embed: ${describeHit(hit)}` };
  }
  if (!ctx.rendered)
    return {
      status: 'unknown',
      evidence: 'Forms may be rendered by JavaScript and the page could not be rendered',
    };
  if (coverage.contactPageInspected === false) {
    return { status: 'unknown', evidence: 'A contact page exists but could not be inspected' };
  }
  const scope = coverage.contactPageInspected
    ? 'homepage and contact page'
    : 'homepage (no contact page linked)';
  return { status: 'no', evidence: `No contact form found on the rendered ${scope}` };
}

const RESERVED_IG = new Set([
  'p',
  'reel',
  'reels',
  'explore',
  'accounts',
  'stories',
  'tv',
  'share',
  'direct',
]);
const RESERVED_FB = new Set([
  'sharer',
  'sharer.php',
  'share.php',
  'share',
  'plugins',
  'dialog',
  'tr',
  'login',
  'groups',
  'events',
  'watch',
]);

export function findSocialLinks(pages: PageAssets[]): {
  instagramUrl: string | null;
  facebookUrl: string | null;
} {
  let instagramUrl: string | null = null;
  let facebookUrl: string | null = null;
  for (const p of pages) {
    for (const a of p.anchors) {
      if (!a.url) continue;
      let u: URL;
      try {
        u = new URL(a.url);
      } catch {
        continue;
      }
      const host = u.hostname.replace(/^www\.|^m\./, '');
      const first = u.pathname.split('/').filter(Boolean)[0];
      if (!first) continue;
      if (
        !instagramUrl &&
        host === 'instagram.com' &&
        !RESERVED_IG.has(first.toLowerCase()) &&
        /^[a-z0-9_.]{1,30}$/i.test(first)
      ) {
        instagramUrl = `https://www.instagram.com/${first}/`;
      }
      if (
        !facebookUrl &&
        (host === 'facebook.com' || host === 'fb.com') &&
        !RESERVED_FB.has(first.toLowerCase())
      ) {
        facebookUrl = first === 'profile.php' ? u.toString() : `https://www.facebook.com/${first}`;
      }
    }
  }
  return { instagramUrl, facebookUrl };
}

const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,24}/gi;

/**
 * Emails published on the business's own pages that belong to its own domain.
 * Never guessed or generated.
 */
export function findBusinessEmails(
  pages: PageAssets[],
  siteUrl: string,
): Array<{ email: string; sourceUrl: string }> {
  const domain = siteHost(siteUrl);
  const out = new Map<string, string>();
  const consider = (raw: string, sourceUrl: string) => {
    const email =
      raw
        .trim()
        .toLowerCase()
        .replace(/^mailto:/, '')
        .split('?')[0] ?? '';
    const at = email.split('@')[1];
    if (!at || /\.(png|jpe?g|gif|webp|svg)$/.test(email)) return;
    if (at === domain || at.endsWith(`.${domain}`) || domain.endsWith(`.${at}`)) {
      if (!out.has(email)) out.set(email, sourceUrl);
    }
  };
  for (const p of pages) {
    for (const a of p.anchors)
      if (/^mailto:/i.test(a.href)) consider(decodeURIComponent(a.href), p.url);
    for (const m of p.bodyText.matchAll(EMAIL_RE)) consider(m[0], p.url);
  }
  return [...out.entries()].map(([email, sourceUrl]) => ({ email, sourceUrl }));
}

/** Highest plausible year in a copyright notice. */
export function findCopyrightYear(text: string, now = new Date()): number | null {
  const max = now.getFullYear() + 1;
  let best: number | null = null;
  const re = /(?:©|&copy;|\(c\)|copyright)\s*(?:©\s*)?(?:\d{4}\s*[-–—]\s*)?(\d{4})/gi;
  for (const m of text.matchAll(re)) {
    const y = Number(m[1]);
    if (y >= 1995 && y <= max && (best === null || y > best)) best = y;
  }
  return best;
}

export function findLastModifiedHint(
  assets: PageAssets | null,
  headers: Record<string, string>,
  now = new Date(),
): string | null {
  const meta = assets?.metas.find((m) =>
    ['article:modified_time', 'og:updated_time', 'last-modified', 'dcterms.modified'].includes(
      m.name,
    ),
  );
  if (meta?.content) return `${meta.name} ${meta.content.slice(0, 40)}`;
  const lm = headers['last-modified'];
  if (lm) {
    const t = Date.parse(lm);
    // Dynamic servers send "now"; only a date at least a day old says anything.
    if (!Number.isNaN(t) && now.getTime() - t > 24 * 3600 * 1000)
      return `Last-Modified header ${new Date(t).toISOString().slice(0, 10)}`;
  }
  return null;
}

const CTA_RE =
  /\b(?:book(?: now| online| a car| your)?|reserve(?: now)?|rent now|get a quote|request a quote|check (?:availability|rates)|call (?:now|us))\b/i;

export function findCallToAction(pages: PageAssets[]): string | null {
  for (const p of pages) {
    const button = p.buttonsText.find((t) => CTA_RE.test(t));
    if (button) return `Button "${button.slice(0, 60)}" on ${p.url}`;
    const anchor = p.anchors.find((a) => CTA_RE.test(a.text));
    if (anchor) return `Link "${anchor.text.slice(0, 60)}" on ${p.url}`;
    const tel = p.anchors.find((a) => /^tel:/i.test(a.href));
    if (tel) return `Click-to-call link ${tel.href} on ${p.url}`;
  }
  return null;
}

export function detectPaymentFields(pages: PageAssets[]): string | null {
  for (const p of pages) {
    for (const f of p.forms)
      if (classifyForm(f).hasPaymentFields) return `Card payment fields in a form on ${p.url}`;
  }
  return null;
}
