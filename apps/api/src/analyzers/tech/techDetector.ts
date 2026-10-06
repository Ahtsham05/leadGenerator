import type { DetectedSignature, Technology } from '@lead/shared';
import type { PageAssets } from '../html/extractAssets.js';
import { TECH_SIGNATURES, type TechSignature } from './signatures.js';

export interface TechDetectionInput {
  assets: PageAssets;
  headers: Record<string, string>;
  setCookies: string[];
}

/** Pluggable provider so Wappalyzer / BuiltWith can replace or augment the signature detector. */
export interface TechDetectionProvider {
  readonly name: string;
  detect(input: TechDetectionInput): Promise<DetectedSignature[]>;
}

const MAX_EVIDENCE = 160;

function excerpt(text: string, re: RegExp): string | null {
  const m = re.exec(text);
  if (!m) return null;
  const start = Math.max(0, m.index - 20);
  const s = text
    .slice(start, m.index + m[0].length + 20)
    .replace(/\s+/g, ' ')
    .trim();
  return s.length > MAX_EVIDENCE ? `${s.slice(0, MAX_EVIDENCE)}...` : s;
}

function firstIn(
  list: string[],
  patterns: RegExp[] | undefined,
): { value: string; re: RegExp } | null {
  for (const re of patterns ?? []) {
    const value = list.find((v) => re.test(v));
    if (value) return { value: value.slice(0, MAX_EVIDENCE), re };
  }
  return null;
}

function cookieNames(setCookies: string[]): string[] {
  return setCookies.map((c) => c.split('=')[0]?.trim() ?? '').filter(Boolean);
}

/** Returns the evidence string for the first matcher that fires, or null. */
export function matchSignature(sig: TechSignature, input: TechDetectionInput): string | null {
  const { assets, headers } = input;
  for (const m of sig.meta ?? []) {
    const meta = assets.metas.find((x) => x.name === m.name && m.content.test(x.content));
    if (meta) return `meta ${m.name}="${meta.content.slice(0, 100)}"`;
  }
  for (const h of sig.headers ?? []) {
    const v = headers[h.name];
    if (v !== undefined && h.value.test(v)) return `response header ${h.name}: ${v.slice(0, 100)}`;
  }
  const script = firstIn(assets.scriptSrcs, sig.scriptSrc);
  if (script) return `script src ${script.value}`;
  const link = firstIn(assets.linkHrefs, sig.linkHref);
  if (link) return `link href ${link.value}`;
  const iframe = firstIn(assets.iframeSrcs, sig.iframeSrc);
  if (iframe) return `iframe src ${iframe.value}`;
  const anchor = firstIn(
    assets.anchors.map((a) => a.url ?? a.href),
    sig.anchorHref,
  );
  if (anchor) return `link to ${anchor.value}`;
  const cookie = firstIn(cookieNames(input.setCookies), sig.cookies);
  if (cookie) return `cookie ${cookie.value}`;
  for (const re of sig.inlineScript ?? []) {
    const ex = excerpt(assets.inlineScripts, re);
    if (ex) return `inline script "${ex}"`;
  }
  for (const re of sig.html ?? []) {
    const ex = excerpt(assets.html, re);
    if (ex) return `HTML "${ex}"`;
  }
  return null;
}

/** Pure signature-based detection. */
export function detectTechnologies(
  input: TechDetectionInput,
  signatures: TechSignature[] = TECH_SIGNATURES,
): DetectedSignature[] {
  const found = new Map<string, DetectedSignature>();
  for (const sig of signatures) {
    const evidence = matchSignature(sig, input);
    if (evidence) found.set(sig.name, { name: sig.name, category: sig.category, evidence });
  }
  for (const sig of signatures) {
    if (!found.has(sig.name)) continue;
    for (const implied of sig.implies ?? []) {
      if (found.has(implied)) continue;
      const target = signatures.find((s) => s.name === implied);
      if (target)
        found.set(implied, {
          name: implied,
          category: target.category,
          evidence: `implied by ${sig.name}`,
        });
    }
  }
  return [...found.values()];
}

export class SignatureTechDetector implements TechDetectionProvider {
  readonly name = 'signatures';
  constructor(private readonly signatures: TechSignature[] = TECH_SIGNATURES) {}
  async detect(input: TechDetectionInput): Promise<DetectedSignature[]> {
    return detectTechnologies(input, this.signatures);
  }
}

const FRAMEWORK_PRIORITY = ['Next.js', 'Nuxt', 'Gatsby', 'Angular', 'React', 'Vue'];
const BUILDER_HOSTING: Record<string, string> = {
  Wix: 'Wix',
  Squarespace: 'Squarespace',
  Webflow: 'Webflow',
  'GoDaddy Website Builder': 'GoDaddy',
  Weebly: 'Weebly',
  Duda: 'Duda',
  Shopify: 'Shopify',
};

/** Collapse a signature list into the summary fields stored on a lead. */
export function summarizeTechnology(signatures: DetectedSignature[]): Technology {
  const names = (cat: DetectedSignature['category']) =>
    signatures.filter((s) => s.category === cat).map((s) => s.name);
  const frameworks = names('framework');
  const builders = names('builder');
  const ecommerce = names('ecommerce');
  const hostingDetected = names('hosting')[0] ?? null;
  const hostedBy = [...builders, ...ecommerce].map((b) => BUILDER_HOSTING[b]).find(Boolean) ?? null;
  return {
    framework: FRAMEWORK_PRIORITY.find((f) => frameworks.includes(f)) ?? frameworks[0] ?? null,
    cms: names('cms')[0] ?? null,
    // Prefer hosted builders over WP page-builder plugins when both appear.
    builder: builders.find((b) => BUILDER_HOSTING[b]) ?? builders[0] ?? null,
    ecommerce: ecommerce[0] ?? null,
    hosting: hostingDetected ?? hostedBy,
    cdn: names('cdn')[0] ?? null,
    analytics: names('analytics'),
    paymentProviders: names('payment'),
    detectedSignatures: signatures,
  };
}
