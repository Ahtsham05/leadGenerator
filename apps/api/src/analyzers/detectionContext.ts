import type { PageAssets } from './html/extractAssets.js';

/**
 * What a presence detector can look at. A detector may only return a confident
 * "no" when the relevant sources were fully analysed.
 */
export interface DetectionContext {
  /** Homepage from a plain HTTP fetch, or null if the fetch failed. */
  static: PageAssets | null;
  /** True when the static fetch succeeded and the body was not truncated. */
  staticComplete: boolean;
  /** Homepage DOM after JavaScript ran (Playwright), or null if rendering failed/disabled. */
  rendered: PageAssets | null;
  /** Additional same-site pages inspected (e.g. booking pages). */
  extraPages?: PageAssets[];
}

export type SourceKind = 'anchor' | 'script' | 'iframe' | 'inline script' | 'HTML';

export interface SourceHit {
  kind: SourceKind;
  value: string;
  page: string;
  label: 'static HTML' | 'rendered page' | 'linked page';
}

export function sourcesOf(
  ctx: DetectionContext,
): Array<{ assets: PageAssets; label: SourceHit['label'] }> {
  const out: Array<{ assets: PageAssets; label: SourceHit['label'] }> = [];
  if (ctx.static) out.push({ assets: ctx.static, label: 'static HTML' });
  if (ctx.rendered) out.push({ assets: ctx.rendered, label: 'rendered page' });
  for (const p of ctx.extraPages ?? []) out.push({ assets: p, label: 'linked page' });
  return out;
}

export interface SourcePatterns {
  anchorHref?: RegExp[];
  scriptSrc?: RegExp[];
  iframeSrc?: RegExp[];
  inlineScript?: RegExp[];
  html?: RegExp[];
}

function snippet(text: string, re: RegExp): string | null {
  const m = re.exec(text);
  if (!m) return null;
  return text
    .slice(Math.max(0, m.index - 15), m.index + m[0].length + 25)
    .replace(/\s+/g, ' ')
    .trim();
}

/** Find the first source matching any of the patterns, across static, rendered and extra pages. */
export function findHit(ctx: DetectionContext, patterns: SourcePatterns): SourceHit | null {
  for (const { assets, label } of sourcesOf(ctx)) {
    const page = assets.url;
    for (const re of patterns.anchorHref ?? []) {
      const a = assets.anchors.find((x) => re.test(x.href) || (x.url !== null && re.test(x.url)));
      if (a) return { kind: 'anchor', value: a.href.slice(0, 160), page, label };
    }
    for (const re of patterns.scriptSrc ?? []) {
      const s = assets.scriptSrcs.find((x) => re.test(x));
      if (s) return { kind: 'script', value: s.slice(0, 160), page, label };
    }
    for (const re of patterns.iframeSrc ?? []) {
      const s = assets.iframeSrcs.find((x) => re.test(x));
      if (s) return { kind: 'iframe', value: s.slice(0, 160), page, label };
    }
    for (const re of patterns.inlineScript ?? []) {
      const s = snippet(assets.inlineScripts, re);
      if (s) return { kind: 'inline script', value: s.slice(0, 160), page, label };
    }
    for (const re of patterns.html ?? []) {
      const s = snippet(assets.html, re);
      if (s) return { kind: 'HTML', value: s.slice(0, 160), page, label };
    }
  }
  return null;
}

export function describeHit(hit: SourceHit): string {
  return `${hit.kind} "${hit.value}" on ${hit.page} (${hit.label})`;
}

/** Tag managers can inject widgets that static HTML never shows. */
export function usesTagManager(assets: PageAssets | null): boolean {
  if (!assets) return false;
  return (
    assets.scriptSrcs.some((s) => /googletagmanager\.com\/gtm\.js/i.test(s)) ||
    /googletagmanager\.com\/gtm\.js/i.test(assets.inlineScripts)
  );
}
