import type { TriState } from '@lead/shared';
import {
  describeHit,
  findHit,
  usesTagManager,
  type DetectionContext,
  type SourcePatterns,
} from './detectionContext.js';

export interface WhatsappResult {
  status: TriState;
  evidence: string;
  provider: string | null;
}

const DIRECT_LINKS: SourcePatterns = {
  anchorHref: [
    /^(?:https?:)?\/\/(?:www\.)?wa\.me\//i,
    /^(?:https?:)?\/\/(?:www\.)?wa\.link\//i,
    /^(?:https?:)?\/\/(?:api|web)\.whatsapp\.com\/send/i,
    /^(?:https?:)?\/\/chat\.whatsapp\.com\//i,
    /^whatsapp:\/\//i,
  ],
  iframeSrc: [/(?:wa\.me|api\.whatsapp\.com)\//i],
  inlineScript: [
    /['"`](?:https?:)?\/\/(?:wa\.me|api\.whatsapp\.com\/send)/i,
    /['"`]whatsapp:\/\/send/i,
  ],
};

/** Known WhatsApp chat-button widgets and plugins. */
export const WHATSAPP_WIDGETS: Array<{ name: string; patterns: SourcePatterns }> = [
  {
    name: 'GetButton',
    patterns: { scriptSrc: [/static\.getbutton\.io/i], inlineScript: [/static\.getbutton\.io/i] },
  },
  {
    name: 'WhatsHelp',
    patterns: { scriptSrc: [/widget\.whatshelp\.io/i], inlineScript: [/widget\.whatshelp\.io/i] },
  },
  {
    name: 'Joinchat (WordPress)',
    patterns: {
      scriptSrc: [/\/plugins\/creame-whatsapp-me\//i, /\/plugins\/joinchat\//i],
      html: [/class="[^"]*\bjoinchat\b/i],
    },
  },
  {
    name: 'Click to Chat (WordPress)',
    patterns: {
      scriptSrc: [/\/plugins\/click-to-chat-for-whatsapp\//i],
      html: [/class="[^"]*\bht-ctc\b/i],
    },
  },
  {
    name: 'WP Social Chat (WordPress)',
    patterns: { scriptSrc: [/\/plugins\/wp-whatsapp-chat\//i], html: [/class="[^"]*\bqlwapp\b/i] },
  },
  {
    name: 'NinjaTeam WhatsApp (WordPress)',
    patterns: { scriptSrc: [/\/plugins\/wp-whatsapp\//i], html: [/\bnjt-whatsapp\b/i] },
  },
  {
    name: 'Elfsight WhatsApp Chat',
    patterns: { html: [/elfsight-app-[0-9a-f-]+[^>]*whatsapp|whatsapp[^>]*elfsight-app/i] },
  },
  {
    name: 'WATI',
    patterns: { scriptSrc: [/wati\.io\/.*widget|wati-widget/i], inlineScript: [/wati\.io/i] },
  },
  { name: 'Callbell', patterns: { scriptSrc: [/callbell\.eu/i], inlineScript: [/callbell\.eu/i] } },
];

/**
 * Detects a WhatsApp channel. Returns "no" only when the full homepage was analysed:
 * the static HTML was complete AND either the rendered page was checked or no tag
 * manager could have injected a widget invisibly.
 */
export function detectWhatsapp(ctx: DetectionContext): WhatsappResult {
  const direct = findHit(ctx, DIRECT_LINKS);
  if (direct)
    return { status: 'yes', evidence: `WhatsApp link: ${describeHit(direct)}`, provider: null };
  for (const w of WHATSAPP_WIDGETS) {
    const hit = findHit(ctx, w.patterns);
    if (hit)
      return { status: 'yes', evidence: `${w.name} widget: ${describeHit(hit)}`, provider: w.name };
  }
  if (!ctx.staticComplete && !ctx.rendered) {
    return { status: 'unknown', evidence: 'Homepage could not be fully analysed', provider: null };
  }
  if (!ctx.rendered && usesTagManager(ctx.static)) {
    return {
      status: 'unknown',
      evidence:
        'Not found in static HTML, but the site uses Google Tag Manager and the rendered page could not be checked',
      provider: null,
    };
  }
  const scope = ctx.rendered
    ? ctx.staticComplete
      ? 'static HTML and rendered homepage'
      : 'rendered homepage'
    : 'complete static homepage HTML';
  return {
    status: 'no',
    evidence: `No wa.me / api.whatsapp.com link or known WhatsApp widget found in the ${scope}`,
    provider: null,
  };
}
