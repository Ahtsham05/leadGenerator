import { performance } from 'node:perf_hooks';
import { request, type Dispatcher } from 'undici';
import { assertPublicHost, normalizeUrl, type HostGuard } from './urlSafety.js';
import { getTargetDispatcher } from './httpDispatcher.js';

export type SafeGetErrorCode =
  'INVALID_URL' | 'UNSAFE_HOST' | 'DNS_FAILURE' | 'TIMEOUT' | 'TOO_MANY_REDIRECTS' | 'NETWORK';

export interface SafeGetOptions {
  timeoutMs: number;
  userAgent: string;
  maxBytes: number;
  maxRedirects?: number;
  accept?: string;
  signal?: AbortSignal;
  /** Injectable for tests; defaults to the strict public-host guard. */
  hostGuard?: HostGuard;
  dispatcher?: Dispatcher;
  /** Called before each hop (initial + redirects); return false to stop (e.g. robots). */
  beforeHop?: (url: URL) => Promise<boolean>;
}

export interface SafeGetResponse {
  ok: true;
  finalUrl: string;
  redirects: string[];
  status: number;
  headers: Record<string, string>;
  setCookies: string[];
  body: Buffer;
  truncated: boolean;
  ttfbMs: number;
  totalMs: number;
}

export interface SafeGetFailure {
  ok: false;
  code: SafeGetErrorCode | 'STOPPED';
  message: string;
  finalUrl: string | null;
  redirects: string[];
  stoppedAt?: string;
}

function flattenHeaders(raw: Record<string, string | string[] | undefined>) {
  const headers: Record<string, string> = {};
  let setCookies: string[] = [];
  for (const [k, v] of Object.entries(raw)) {
    if (v === undefined) continue;
    const key = k.toLowerCase();
    if (key === 'set-cookie') setCookies = Array.isArray(v) ? v : [v];
    else headers[key] = Array.isArray(v) ? v.join(', ') : v;
  }
  return { headers, setCookies };
}

function classifyNetworkError(err: unknown): { code: SafeGetErrorCode; message: string } {
  const e = err as { name?: string; code?: string; message?: string; cause?: { code?: string } };
  const code = e.code ?? e.cause?.code;
  if (
    e.name === 'AbortError' ||
    e.name === 'TimeoutError' ||
    code === 'UND_ERR_HEADERS_TIMEOUT' ||
    code === 'UND_ERR_BODY_TIMEOUT' ||
    code === 'UND_ERR_CONNECT_TIMEOUT'
  ) {
    return { code: 'TIMEOUT', message: 'Request timed out' };
  }
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN')
    return { code: 'DNS_FAILURE', message: `DNS lookup failed (${code})` };
  if (e.name === 'UnsafeHostError' || /private address/i.test(e.message ?? '')) {
    return { code: 'UNSAFE_HOST', message: e.message ?? 'Unsafe host' };
  }
  return { code: 'NETWORK', message: e.message ?? 'Network error' };
}

/**
 * GET with SSRF protection on every hop, manual redirect handling, an overall
 * timeout, and a hard cap on body size (excess is discarded, `truncated` set).
 */
export async function safeGet(
  input: string,
  opts: SafeGetOptions,
): Promise<SafeGetResponse | SafeGetFailure> {
  const maxRedirects = opts.maxRedirects ?? 5;
  const guard = opts.hostGuard ?? assertPublicHost;
  const redirects: string[] = [];
  const norm = normalizeUrl(input);
  if (!norm.ok)
    return { ok: false, code: 'INVALID_URL', message: norm.error, finalUrl: null, redirects };

  const timeout = AbortSignal.timeout(opts.timeoutMs);
  const signal = opts.signal ? AbortSignal.any([timeout, opts.signal]) : timeout;
  const started = performance.now();
  let url = norm.url;

  for (let hop = 0; ; hop++) {
    try {
      await guard(url.hostname);
    } catch (err) {
      const c = classifyNetworkError(err);
      return {
        ok: false,
        code: c.code === 'NETWORK' ? 'UNSAFE_HOST' : c.code,
        message: c.message,
        finalUrl: url.toString(),
        redirects,
      };
    }
    if (opts.beforeHop && !(await opts.beforeHop(url))) {
      return {
        ok: false,
        code: 'STOPPED',
        message: 'Stopped before request',
        finalUrl: url.toString(),
        redirects,
        stoppedAt: url.toString(),
      };
    }

    let res: Dispatcher.ResponseData;
    try {
      res = await request(url, {
        method: 'GET',
        dispatcher: opts.dispatcher ?? getTargetDispatcher(),
        signal,
        headers: {
          'user-agent': opts.userAgent,
          accept: opts.accept ?? 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5',
          'accept-language': 'en-US,en;q=0.8',
        },
      });
    } catch (err) {
      const c = classifyNetworkError(
        signal.aborted && !opts.signal?.aborted
          ? Object.assign(new Error('timeout'), { name: 'TimeoutError' })
          : err,
      );
      return { ok: false, ...c, finalUrl: url.toString(), redirects };
    }
    const ttfbMs = Math.round(performance.now() - started);
    const { headers, setCookies } = flattenHeaders(res.headers);

    if (res.statusCode >= 300 && res.statusCode < 400 && headers.location) {
      await res.body.dump();
      if (hop >= maxRedirects) {
        return {
          ok: false,
          code: 'TOO_MANY_REDIRECTS',
          message: `More than ${maxRedirects} redirects`,
          finalUrl: url.toString(),
          redirects,
        };
      }
      let next: URL;
      try {
        next = new URL(headers.location, url);
      } catch {
        return {
          ok: false,
          code: 'INVALID_URL',
          message: 'Invalid redirect location',
          finalUrl: url.toString(),
          redirects,
        };
      }
      const nextNorm = normalizeUrl(next.toString());
      if (!nextNorm.ok) {
        return {
          ok: false,
          code: 'UNSAFE_HOST',
          message: `Redirect rejected: ${nextNorm.error}`,
          finalUrl: url.toString(),
          redirects,
        };
      }
      redirects.push(url.toString());
      url = nextNorm.url;
      continue;
    }

    const chunks: Buffer[] = [];
    let size = 0;
    let truncated = false;
    try {
      for await (const chunk of res.body) {
        const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
        if (size + buf.length > opts.maxBytes) {
          chunks.push(buf.subarray(0, opts.maxBytes - size));
          size = opts.maxBytes;
          truncated = true;
          res.body.destroy();
          break;
        }
        chunks.push(buf);
        size += buf.length;
      }
    } catch (err) {
      if (!truncated) {
        const c = classifyNetworkError(
          signal.aborted ? Object.assign(new Error('timeout'), { name: 'TimeoutError' }) : err,
        );
        return { ok: false, ...c, finalUrl: url.toString(), redirects };
      }
    }
    return {
      ok: true,
      finalUrl: url.toString(),
      redirects,
      status: res.statusCode,
      headers,
      setCookies,
      body: Buffer.concat(chunks),
      truncated,
      ttfbMs,
      totalMs: Math.round(performance.now() - started),
    };
  }
}

/** Decode a body using the charset from the content-type header (default UTF-8). */
export function decodeBody(body: Buffer, contentType: string | undefined): string {
  const charset =
    /charset=([^;]+)/i
      .exec(contentType ?? '')?.[1]
      ?.trim()
      .replace(/["']/g, '') ?? 'utf-8';
  try {
    return new TextDecoder(charset, { fatal: false }).decode(body);
  } catch {
    return new TextDecoder('utf-8').decode(body);
  }
}
