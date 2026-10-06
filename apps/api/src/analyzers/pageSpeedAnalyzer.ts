import { emptyPerformance, type Performance } from '@lead/shared';
import { request } from 'undici';
import { getApiDispatcher } from './net/httpDispatcher.js';

export type PsiStrategy = 'mobile' | 'desktop';

export interface PsiStrategyResult {
  score: number | null;
  lcpMs: number | null;
  inpMs: number | null;
  inpSource: 'inp' | 'tbt' | null;
  cls: number | null;
  ttfbMs: number | null;
  fetchedAt: Date;
}

export interface PageSpeedCache {
  get(url: string, strategy: PsiStrategy): Promise<PsiStrategyResult | null>;
  set(url: string, strategy: PsiStrategy, result: PsiStrategyResult): Promise<void>;
}

export interface UsageCounter {
  increment(service: 'pagespeed', count?: number): Promise<void>;
}

export type HttpGetJson = (
  url: string,
  signal: AbortSignal,
) => Promise<{ status: number; json: unknown }>;

export interface PageSpeedOptions {
  apiKey?: string;
  timeoutMs: number;
  cache?: PageSpeedCache;
  usage?: UsageCounter;
  httpGetJson?: HttpGetJson;
  signal?: AbortSignal;
}

type PsiOutcome =
  | { ok: true; result: PsiStrategyResult; cached: boolean }
  | { ok: false; status: 'unavailable' | 'failed'; message: string };

const ENDPOINT = 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed';

const defaultHttpGetJson: HttpGetJson = async (url, signal) => {
  const res = await request(url, {
    method: 'GET',
    signal,
    dispatcher: getApiDispatcher(),
    headers: { accept: 'application/json' },
  });
  const text = await res.body.text();
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { status: res.statusCode, json };
};

// PSI responses are large, loosely-typed JSON; we read only a few paths defensively.
type Json = Record<string, unknown>;
const obj = (v: unknown): Json | undefined =>
  v && typeof v === 'object' ? (v as Json) : undefined;
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** Extract the metrics we store from a PSI v5 response. Pure; exported for tests. */
export function parsePsiResponse(json: unknown, now = new Date()): PsiStrategyResult | null {
  const lh = obj(obj(json)?.lighthouseResult);
  if (!lh) return null;
  const perf = num(obj(obj(lh.categories)?.performance)?.score);
  const audits = obj(lh.audits) ?? {};
  const audit = (id: string) => num(obj(audits[id])?.numericValue);
  const field = obj(obj(obj(json)?.loadingExperience)?.metrics) ?? {};
  const fieldPct = (id: string) => num(obj(field[id])?.percentile);

  const inpField = fieldPct('INTERACTION_TO_NEXT_PAINT');
  const tbt = audit('total-blocking-time');
  return {
    score: perf === null ? null : Math.round(perf * 100),
    lcpMs: audit('largest-contentful-paint'),
    inpMs: inpField ?? tbt,
    inpSource: inpField !== null ? 'inp' : tbt !== null ? 'tbt' : null,
    cls: audit('cumulative-layout-shift'),
    ttfbMs: audit('server-response-time') ?? fieldPct('EXPERIMENTAL_TIME_TO_FIRST_BYTE'),
    fetchedAt: now,
  };
}

function classifyError(
  status: number,
  json: unknown,
): { status: 'unavailable' | 'failed'; message: string } {
  const err = obj(obj(json)?.error);
  const message =
    typeof err?.message === 'string' ? err.message : `PageSpeed API responded ${status}`;
  const reasons = JSON.stringify(err?.errors ?? err?.details ?? '');
  if (
    status === 429 ||
    /RESOURCE_EXHAUSTED|rateLimitExceeded|dailyLimitExceeded|quota/i.test(
      `${err?.status ?? ''} ${reasons} ${message}`,
    )
  ) {
    return { status: 'unavailable', message: 'PageSpeed API quota exceeded' };
  }
  if (status === 403)
    return { status: 'unavailable', message: 'PageSpeed API key rejected or API not enabled' };
  // 400/500 with a Lighthouse runtime error means Google could not load the page.
  return { status: 'failed', message: message.slice(0, 300) };
}

async function runStrategy(
  url: string,
  strategy: PsiStrategy,
  opts: PageSpeedOptions,
): Promise<PsiOutcome> {
  const cached = await opts.cache?.get(url, strategy).catch(() => null);
  if (cached) return { ok: true, result: cached, cached: true };

  const params = new URLSearchParams({ url, strategy, category: 'performance' });
  if (opts.apiKey) params.set('key', opts.apiKey);
  const timeout = AbortSignal.timeout(opts.timeoutMs);
  const signal = opts.signal ? AbortSignal.any([timeout, opts.signal]) : timeout;
  try {
    await opts.usage?.increment('pagespeed', 1);
    const { status, json } = await (opts.httpGetJson ?? defaultHttpGetJson)(
      `${ENDPOINT}?${params.toString()}`,
      signal,
    );
    if (status !== 200) return { ok: false, ...classifyError(status, json) };
    const result = parsePsiResponse(json);
    if (!result || result.score === null)
      return {
        ok: false,
        status: 'failed',
        message: 'PageSpeed response had no performance score',
      };
    await opts.cache?.set(url, strategy, result).catch(() => undefined);
    return { ok: true, result, cached: false };
  } catch (err) {
    const name = (err as { name?: string }).name;
    if (name === 'AbortError' || name === 'TimeoutError' || timeout.aborted) {
      return { ok: false, status: 'failed', message: `PageSpeed ${strategy} run timed out` };
    }
    // Never include the request URL here: it carries the API key.
    return {
      ok: false,
      status: 'failed',
      message: `PageSpeed ${strategy} request failed: ${(err as Error).message ?? 'error'}`,
    };
  }
}

export interface PageSpeedAnalysis {
  performance: Performance;
  errors: string[];
}

/**
 * Runs mobile and desktop in parallel. Core metrics come from the mobile run.
 * Never throws: failures are reflected in performanceStatus.
 */
export async function analyzePageSpeed(
  url: string,
  opts: PageSpeedOptions,
): Promise<PageSpeedAnalysis> {
  const [mobile, desktop] = await Promise.all([
    runStrategy(url, 'mobile', opts),
    runStrategy(url, 'desktop', opts),
  ]);
  const perf = emptyPerformance();
  const errors: string[] = [];
  if (desktop.ok) {
    perf.desktopScore = desktop.result.score;
    perf.desktopLcpMs = desktop.result.lcpMs;
  } else errors.push(`desktop: ${desktop.message}`);

  if (mobile.ok) {
    Object.assign(perf, {
      mobileScore: mobile.result.score,
      lcpMs: mobile.result.lcpMs,
      inpMs: mobile.result.inpMs,
      inpSource: mobile.result.inpSource,
      cls: mobile.result.cls,
      ttfbMs: mobile.result.ttfbMs,
      fetchedAt: mobile.result.fetchedAt,
      performanceStatus: 'ok',
    } satisfies Partial<Performance>);
  } else {
    errors.push(`mobile: ${mobile.message}`);
    perf.performanceStatus = mobile.status;
    perf.performanceError = mobile.message;
    if (desktop.ok) perf.fetchedAt = desktop.result.fetchedAt;
  }
  return { performance: perf, errors };
}
