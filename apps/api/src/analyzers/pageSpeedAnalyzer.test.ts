import { describe, expect, it, vi } from 'vitest';
import { fixtureJson } from '../../test/fixtures.js';
import {
  analyzePageSpeed,
  parsePsiResponse,
  type HttpGetJson,
  type PageSpeedCache,
  type PsiStrategyResult,
} from './pageSpeedAnalyzer.js';

const mobile = fixtureJson('psi-mobile.json');
const desktop = fixtureJson('psi-desktop-no-field.json');

const fakeHttp = (
  responses: Record<string, { status: number; json: unknown } | Error>,
): HttpGetJson =>
  vi.fn(async (url: string) => {
    const strategy = new URL(url).searchParams.get('strategy') ?? '';
    const r = responses[strategy];
    if (!r) throw new Error('unexpected');
    if (r instanceof Error) throw r;
    return r;
  });

class MemoryCache implements PageSpeedCache {
  store = new Map<string, PsiStrategyResult>();
  async get(url: string, s: string) {
    return this.store.get(`${s}:${url}`) ?? null;
  }
  async set(url: string, s: string, r: PsiStrategyResult) {
    this.store.set(`${s}:${url}`, r);
  }
}

describe('parsePsiResponse', () => {
  it('extracts score and metrics, preferring field INP', () => {
    expect(parsePsiResponse(mobile)).toMatchObject({
      score: 27,
      lcpMs: 7321.5,
      cls: 0.183,
      ttfbMs: 980.2,
      inpMs: 312,
      inpSource: 'inp',
    });
  });
  it('falls back to TBT when INP field data is missing', () => {
    expect(parsePsiResponse(desktop)).toMatchObject({ score: 71, inpMs: 230, inpSource: 'tbt' });
  });
  it('returns null for unexpected payloads', () => {
    expect(parsePsiResponse({ foo: 1 })).toBeNull();
  });
});

describe('analyzePageSpeed', () => {
  it('combines mobile and desktop runs and counts usage', async () => {
    const usage = { increment: vi.fn(async () => undefined) };
    const r = await analyzePageSpeed('https://example.com/', {
      timeoutMs: 1000,
      apiKey: 'k',
      usage,
      httpGetJson: fakeHttp({
        mobile: { status: 200, json: mobile },
        desktop: { status: 200, json: desktop },
      }),
    });
    expect(r.performance).toMatchObject({
      performanceStatus: 'ok',
      mobileScore: 27,
      desktopScore: 71,
      lcpMs: 7321.5,
      desktopLcpMs: 2100,
    });
    expect(usage.increment).toHaveBeenCalledTimes(2);
    expect(r.errors).toEqual([]);
  });

  it('serves from cache without calling the API', async () => {
    const cache = new MemoryCache();
    const http = fakeHttp({
      mobile: { status: 200, json: mobile },
      desktop: { status: 200, json: desktop },
    });
    await analyzePageSpeed('https://example.com/', { timeoutMs: 1000, cache, httpGetJson: http });
    const usage = { increment: vi.fn(async () => undefined) };
    const again = await analyzePageSpeed('https://example.com/', {
      timeoutMs: 1000,
      cache,
      httpGetJson: http,
      usage,
    });
    expect(http).toHaveBeenCalledTimes(2);
    expect(usage.increment).not.toHaveBeenCalled();
    expect(again.performance.mobileScore).toBe(27);
  });

  it('quota errors => unavailable', async () => {
    const quota = {
      status: 429,
      json: {
        error: {
          code: 429,
          message: 'Quota exceeded for quota metric',
          status: 'RESOURCE_EXHAUSTED',
        },
      },
    };
    const r = await analyzePageSpeed('https://example.com/', {
      timeoutMs: 1000,
      httpGetJson: fakeHttp({ mobile: quota, desktop: quota }),
    });
    expect(r.performance.performanceStatus).toBe('unavailable');
    expect(r.performance.performanceError).toBe('PageSpeed API quota exceeded');
  });

  it('lighthouse failures => failed; desktop still kept', async () => {
    const fail = {
      status: 500,
      json: { error: { message: 'Lighthouse returned error: FAILED_DOCUMENT_REQUEST' } },
    };
    const r = await analyzePageSpeed('https://example.com/', {
      timeoutMs: 1000,
      httpGetJson: fakeHttp({ mobile: fail, desktop: { status: 200, json: desktop } }),
    });
    expect(r.performance.performanceStatus).toBe('failed');
    expect(r.performance.desktopScore).toBe(71);
    expect(r.performance.mobileScore).toBeNull();
  });

  it('timeouts => failed, and the error never contains the API key', async () => {
    const abort = Object.assign(new Error('aborted'), { name: 'AbortError' });
    const r = await analyzePageSpeed('https://example.com/', {
      timeoutMs: 1000,
      apiKey: 'SECRET',
      httpGetJson: fakeHttp({ mobile: abort, desktop: abort }),
    });
    expect(r.performance.performanceStatus).toBe('failed');
    expect(JSON.stringify(r)).not.toContain('SECRET');
  });
});
