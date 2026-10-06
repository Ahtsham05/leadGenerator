import { RobotsChecker } from './net/robotsChecker.js';
import { decodeBody, safeGet, type SafeGetOptions } from './net/safeGet.js';

export type FetchPageErrorCode =
  | 'INVALID_URL'
  | 'UNSAFE_HOST'
  | 'DNS_FAILURE'
  | 'TIMEOUT'
  | 'TOO_MANY_REDIRECTS'
  | 'NETWORK'
  | 'ROBOTS_DISALLOWED'
  | 'BLOCKED'
  | 'RATE_LIMITED'
  | 'HTTP_ERROR'
  | 'NOT_HTML';

export interface FetchPageResult {
  ok: boolean;
  requestedUrl: string;
  finalUrl: string | null;
  redirects: string[];
  status: number | null;
  headers: Record<string, string>;
  setCookies: string[];
  html: string | null;
  /** True when the body exceeded the size cap and was cut off. */
  truncated: boolean;
  timing: { ttfbMs: number | null; totalMs: number | null };
  /** Site actively refused us (403, challenge page, robots). We record and move on. */
  blocked: boolean;
  error: { code: FetchPageErrorCode; message: string } | null;
}

export interface FetchPageOptions extends Omit<SafeGetOptions, 'beforeHop'> {
  /** Defaults to true. */
  respectRobots?: boolean;
  robots?: RobotsChecker;
}

const CHALLENGE_MARKERS = [
  /<title>\s*(just a moment|attention required|access denied|security check)/i,
  /cf-browser-verification|cf_chl_opt|challenge-platform/i,
  /g-recaptcha|h-captcha|hcaptcha\.com\/1\/api\.js/i,
  /px-captcha|_Incapsula_Resource|distil_r_captcha/i,
];

/** True when the HTML looks like an anti-bot or CAPTCHA interstitial. We never try to bypass these. */
export function looksLikeChallenge(html: string, status: number): boolean {
  const head = html.slice(0, 20000);
  // reCAPTCHA on a normal 200 page is usually just a contact form, so only treat
  // generic captcha markers as a block when the response is also an error.
  if (/<title>\s*(just a moment|attention required)/i.test(head)) return true;
  if (/cf_chl_opt|cf-browser-verification/i.test(head)) return true;
  if (status === 403 || status === 503 || status === 429)
    return CHALLENGE_MARKERS.some((r) => r.test(head));
  return false;
}

function base(requestedUrl: string): FetchPageResult {
  return {
    ok: false,
    requestedUrl,
    finalUrl: null,
    redirects: [],
    status: null,
    headers: {},
    setCookies: [],
    html: null,
    truncated: false,
    timing: { ttfbMs: null, totalMs: null },
    blocked: false,
    error: null,
  };
}

/**
 * Fetch a homepage politely and safely. Never throws for expected failures.
 */
export async function fetchPage(url: string, opts: FetchPageOptions): Promise<FetchPageResult> {
  const out = base(url);
  const respectRobots = opts.respectRobots ?? true;
  const robots =
    opts.robots ??
    new RobotsChecker({
      userAgent: opts.userAgent,
      hostGuard: opts.hostGuard,
      dispatcher: opts.dispatcher,
      signal: opts.signal,
    });
  let robotsReason = '';

  let res;
  try {
    res = await safeGet(url, {
      ...opts,
      beforeHop: respectRobots
        ? async (hopUrl) => {
            const d = await robots.check(hopUrl);
            robotsReason = d.reason;
            return d.allowed;
          }
        : undefined,
    });
  } catch (err) {
    // safeGet is designed not to throw; this is a last-resort guard.
    return {
      ...out,
      error: { code: 'NETWORK', message: err instanceof Error ? err.message : String(err) },
    };
  }

  if (!res.ok) {
    out.finalUrl = res.finalUrl;
    out.redirects = res.redirects;
    if (res.code === 'STOPPED') {
      return {
        ...out,
        blocked: true,
        error: { code: 'ROBOTS_DISALLOWED', message: `Disallowed by robots.txt: ${robotsReason}` },
      };
    }
    return { ...out, error: { code: res.code, message: res.message } };
  }

  const contentType = res.headers['content-type'] ?? '';
  const html = decodeBody(res.body, contentType);
  Object.assign(out, {
    finalUrl: res.finalUrl,
    redirects: res.redirects,
    status: res.status,
    headers: res.headers,
    setCookies: res.setCookies,
    truncated: res.truncated,
    timing: { ttfbMs: res.ttfbMs, totalMs: res.totalMs },
  });

  if (res.status === 429 || (res.status === 503 && !looksLikeChallenge(html, res.status))) {
    return { ...out, error: { code: 'RATE_LIMITED', message: `Site responded ${res.status}` } };
  }
  if (looksLikeChallenge(html, res.status)) {
    return {
      ...out,
      blocked: true,
      error: { code: 'BLOCKED', message: `Anti-bot or CAPTCHA page (status ${res.status})` },
    };
  }
  if (res.status === 401 || res.status === 403) {
    return {
      ...out,
      blocked: true,
      error: { code: 'BLOCKED', message: `Access refused (status ${res.status})` },
    };
  }
  if (res.status >= 400) {
    return { ...out, error: { code: 'HTTP_ERROR', message: `Site responded ${res.status}` } };
  }
  if (contentType && !/html|xml/i.test(contentType)) {
    return {
      ...out,
      error: { code: 'NOT_HTML', message: `Unexpected content type ${contentType}` },
    };
  }
  return { ...out, ok: true, html };
}
