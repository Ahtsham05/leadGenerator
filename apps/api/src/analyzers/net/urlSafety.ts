import { lookup as dnsLookup } from 'node:dns/promises';
import { isIP } from 'node:net';

export type UrlCheck = { ok: true; url: URL } | { ok: false; error: string };

const BLOCKED_HOST_SUFFIXES = ['.localhost', '.local', '.internal', '.lan', '.home.arpa'];

/**
 * Normalises user-supplied website input into an absolute http(s) URL.
 * Adds https:// when no scheme is given, lower-cases the host, drops fragments
 * and default ports, and rejects credentials and non-http(s) schemes.
 */
export function normalizeUrl(input: string): UrlCheck {
  const raw = input.trim();
  if (!raw) return { ok: false, error: 'URL is empty' };
  const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(raw);
  // "example.com:8080" looks like a scheme to the regex; treat host:port as schemeless.
  const looksLikeHostPort = /^[^/:]+:\d+(\/|$)/.test(raw);
  const candidate = hasScheme && !looksLikeHostPort ? raw : `https://${raw.replace(/^\/\//, '')}`;
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return { ok: false, error: 'URL is not valid' };
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { ok: false, error: `Scheme "${url.protocol.replace(':', '')}" is not allowed` };
  }
  if (url.username || url.password)
    return { ok: false, error: 'URLs with credentials are not allowed' };
  if (!url.hostname) return { ok: false, error: 'URL has no host' };
  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  if (host === 'localhost' || BLOCKED_HOST_SUFFIXES.some((s) => host.endsWith(s))) {
    return { ok: false, error: 'Local hostnames are not allowed' };
  }
  if (!isIP(stripBrackets(host)) && !host.includes('.')) {
    return { ok: false, error: 'Hostname must be a public domain' };
  }
  if (isIP(stripBrackets(host)) && isPrivateIp(stripBrackets(host))) {
    return { ok: false, error: 'Private or reserved IP addresses are not allowed' };
  }
  url.hostname = host;
  url.hash = '';
  return { ok: true, url };
}

function stripBrackets(host: string): string {
  return host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host;
}

function ipv4ToInt(ip: string): number {
  return ip.split('.').reduce((acc, oct) => (acc << 8) + Number(oct), 0) >>> 0;
}

const V4_BLOCKS: Array<[string, number]> = [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.88.99.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
];

function inV4Block(ip: string, base: string, bits: number): boolean {
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return (ipv4ToInt(ip) & mask) === (ipv4ToInt(base) & mask);
}

/** True for loopback, private, link-local, CGNAT, multicast, documentation and reserved ranges. */
export function isPrivateIp(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) return V4_BLOCKS.some(([b, bits]) => inV4Block(ip, b, bits));
  if (v === 6) {
    const lower = ip.toLowerCase();
    if (lower === '::' || lower === '::1') return true;
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(lower);
    if (mapped?.[1]) return isPrivateIp(mapped[1]);
    // IPv4-mapped in hex form, e.g. ::ffff:7f00:1
    const mappedHex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(lower);
    if (mappedHex?.[1] && mappedHex[2]) {
      const n = (parseInt(mappedHex[1], 16) << 16) + parseInt(mappedHex[2], 16);
      return isPrivateIp([n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.'));
    }
    const first = parseInt(lower.split(':')[0] || '0', 16);
    if ((first & 0xfe00) === 0xfc00) return true; // fc00::/7 unique local
    if ((first & 0xffc0) === 0xfe80) return true; // fe80::/10 link local
    if ((first & 0xff00) === 0xff00) return true; // multicast
    if (lower.startsWith('64:ff9b:')) return true; // NAT64 can reach v4 internals
    if (lower.startsWith('2001:db8:')) return true; // documentation
    return false;
  }
  return true; // not an IP at all: treat as unsafe
}

export type HostGuard = (hostname: string) => Promise<void>;

export class UnsafeHostError extends Error {
  override name = 'UnsafeHostError';
}

/**
 * Resolves a hostname and rejects it if ANY resolved address is private.
 * Used before every outbound request to a user-supplied or discovered URL.
 */
export const assertPublicHost: HostGuard = async (hostname) => {
  const host = stripBrackets(hostname.toLowerCase());
  if (isIP(host)) {
    if (isPrivateIp(host)) throw new UnsafeHostError(`Address ${host} is private or reserved`);
    return;
  }
  if (host === 'localhost' || BLOCKED_HOST_SUFFIXES.some((s) => host.endsWith(s))) {
    throw new UnsafeHostError(`Host ${host} is local`);
  }
  const addrs = await dnsLookup(host, { all: true, verbatim: true });
  if (addrs.length === 0) throw new UnsafeHostError(`Host ${host} did not resolve`);
  const bad = addrs.find((a) => isPrivateIp(a.address));
  if (bad) throw new UnsafeHostError(`Host ${host} resolves to private address ${bad.address}`);
};

/** Registrable-ish site key: host without "www." — used for same-site checks. */
export function siteHost(url: URL | string): string {
  const u = typeof url === 'string' ? new URL(url) : url;
  return u.hostname.toLowerCase().replace(/^www\./, '');
}

/** True when `candidate` is on the same site as `base` (same host or a subdomain of it). */
export function isSameSite(base: URL | string, candidate: URL | string): boolean {
  const a = siteHost(base);
  const b = siteHost(candidate);
  return a === b || b.endsWith(`.${a}`) || a.endsWith(`.${b}`);
}

/** Stable key used to find an existing lead for the same website. */
export function websiteKey(url: URL | string): string {
  const u = typeof url === 'string' ? new URL(url) : url;
  const path = u.pathname.replace(/\/+$/, '');
  return `${siteHost(u)}${path}`.toLowerCase();
}
