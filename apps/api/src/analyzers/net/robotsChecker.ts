import { isPathAllowed, parseRobots, productTokenOf, type RobotsPolicy } from './robots.js';
import { decodeBody, safeGet, type SafeGetOptions } from './safeGet.js';

type FetchOpts = Pick<SafeGetOptions, 'userAgent' | 'hostGuard' | 'dispatcher' | 'signal'>;

const ROBOTS_TIMEOUT_MS = 8000;
const ROBOTS_MAX_BYTES = 512 * 1024; // RFC 9309 requires at least 500 KiB to be parsed.
const CACHE_TTL_MS = 60 * 60 * 1000;

export interface RobotsDecision {
  allowed: boolean;
  reason: string;
}

/** Fetches and caches robots.txt per origin and answers "may we fetch this URL?". */
export class RobotsChecker {
  private cache = new Map<string, { policy: RobotsPolicy; reason: string; expires: number }>();

  constructor(private readonly opts: FetchOpts) {}

  async check(target: URL): Promise<RobotsDecision> {
    const { policy, reason } = await this.policyFor(target.origin);
    const allowed = isPathAllowed(
      policy,
      productTokenOf(this.opts.userAgent),
      `${target.pathname}${target.search}`,
    );
    return {
      allowed,
      reason: allowed
        ? reason
        : `${reason}; path ${target.pathname} is disallowed for our user agent`,
    };
  }

  private async policyFor(origin: string) {
    const hit = this.cache.get(origin);
    if (hit && hit.expires > Date.now()) return hit;
    const res = await safeGet(`${origin}/robots.txt`, {
      ...this.opts,
      timeoutMs: ROBOTS_TIMEOUT_MS,
      maxBytes: ROBOTS_MAX_BYTES,
      accept: 'text/plain,*/*;q=0.5',
    });
    let entry: { policy: RobotsPolicy; reason: string };
    if (!res.ok) {
      // Unreachable robots.txt: RFC 9309 says assume complete disallow.
      entry = {
        policy: { mode: 'disallowAll', groups: [] },
        reason: `robots.txt unreachable (${res.code})`,
      };
    } else if (res.status >= 500) {
      entry = {
        policy: { mode: 'disallowAll', groups: [] },
        reason: `robots.txt returned ${res.status}`,
      };
    } else if (res.status >= 400) {
      entry = { policy: { mode: 'allowAll', groups: [] }, reason: `no robots.txt (${res.status})` };
    } else {
      entry = {
        policy: parseRobots(decodeBody(res.body, res.headers['content-type'])),
        reason: 'robots.txt parsed',
      };
    }
    const stored = { ...entry, expires: Date.now() + CACHE_TTL_MS };
    this.cache.set(origin, stored);
    return stored;
  }
}
