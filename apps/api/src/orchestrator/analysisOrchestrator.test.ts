import { MockAgent } from 'undici';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { classifyBooking } from '../analyzers/booking/bookingClassifier.js';
import type { BookingDetectorResult } from '../analyzers/booking/bookingDetector.js';
import { fetchPage } from '../analyzers/fetchPage.js';
import { RobotsChecker } from '../analyzers/net/robotsChecker.js';
import { analyzePageSpeed, type HttpGetJson } from '../analyzers/pageSpeedAnalyzer.js';
import { SignatureTechDetector } from '../analyzers/tech/techDetector.js';
import { fixture, fixtureAssets, fixtureJson } from '../../test/fixtures.js';
import { makeLead } from '../../test/helpers/memoryRepo.js';
import { allowAll } from '../../test/helpers/testServer.js';
import { silentLogger } from '../../test/helpers/silentLogger.js';
import { AnalysisOrchestrator, type OrchestratorDeps } from './analysisOrchestrator.js';

const ORIGIN = 'https://sunshinecarrental.com';
const UA = 'LeadIntelBot/0.1 (+test)';
const NOW = new Date('2026-06-01T12:00:00Z');

let agent: MockAgent;
beforeEach(() => {
  agent = new MockAgent();
  agent.disableNetConnect();
});
afterEach(async () => {
  await agent.close();
});

function intercept(
  path: string,
  status: number,
  body: string,
  headers: Record<string, string> = { 'content-type': 'text/html; charset=utf-8' },
) {
  agent.get(ORIGIN).intercept({ path, method: 'GET' }).reply(status, body, { headers });
}

const psiOk: HttpGetJson = async (url) => ({
  status: 200,
  json:
    new URL(url).searchParams.get('strategy') === 'mobile'
      ? fixtureJson('psi-mobile.json')
      : fixtureJson('psi-desktop-no-field.json'),
});

/** Booking stage without a browser: renders = fixture assets, classified by the real classifier. */
function fakeBooking(
  homeFixture: string,
  extra: Array<{ fixture: string; role: 'booking' | 'contact' }> = [],
) {
  return vi.fn(async (url: string): Promise<BookingDetectorResult> => {
    const home = fixtureAssets(homeFixture, url);
    const pages = [
      {
        url,
        role: 'homepage' as const,
        assets: home,
        frames: [],
        uninspectableFrames: [],
        loginWall: false,
      },
      ...extra.map((e, i) => ({
        url: `${url}${e.role}-${i}`,
        role: e.role,
        assets: fixtureAssets(e.fixture, `${url}${e.role}-${i}`),
        frames: [],
        uninspectableFrames: [],
        loginWall: false,
      })),
    ];
    const observation = {
      homepageInspected: true,
      homepageBlocked: false,
      homepageError: null,
      complete: true,
      pages,
    };
    return {
      booking: classifyBooking(observation),
      error: null,
      inspection: {
        homepage: {
          ok: true,
          finalUrl: url,
          status: 200,
          assets: home,
          hasViewportMeta: home.hasViewportMeta,
          horizontalOverflowPx: 0,
          screenshotPath: 'screenshots/x.png',
          blocked: false,
          error: null,
        },
        observation,
        extraPages: pages.slice(1).map((p) => p.assets),
        contactPageInspected: extra.some((e) => e.role === 'contact') ? true : null,
        skipped: [],
      },
    };
  });
}

function makeOrchestrator(over: Partial<OrchestratorDeps> = {}) {
  const robots = new RobotsChecker({ userAgent: UA, dispatcher: agent, hostGuard: allowAll });
  const http = vi.fn(psiOk);
  const deps: OrchestratorDeps = {
    logger: silentLogger,
    now: () => NOW,
    techProvider: new SignatureTechDetector(),
    fetchPage: (url, signal) =>
      fetchPage(url, {
        timeoutMs: 2000,
        userAgent: UA,
        maxBytes: 3_000_000,
        dispatcher: agent,
        hostGuard: allowAll,
        robots,
        signal,
      }),
    pageSpeed: (url) => analyzePageSpeed(url, { timeoutMs: 2000, httpGetJson: http }),
    detectBooking: fakeBooking('wordpress-elementor.html'),
    ...over,
  };
  return { orchestrator: new AnalysisOrchestrator(deps), deps, http };
}

const target = (over: Partial<ReturnType<typeof makeLead>> = {}) =>
  makeLead({
    businessName: 'Sunshine Car Rental',
    website: `${ORIGIN}/`,
    reviewCount: 240,
    rating: 4.6,
    ...over,
  });

describe('AnalysisOrchestrator (network mocked)', () => {
  it('produces a full, evidence-backed analysis for a WordPress rental site', async () => {
    intercept('/robots.txt', 200, 'User-agent: *\nDisallow: /wp-admin/\n', {
      'content-type': 'text/plain',
    });
    intercept('/', 200, fixture('wordpress-elementor.html'), {
      'content-type': 'text/html; charset=utf-8',
      server: 'cloudflare',
    });
    const { orchestrator } = makeOrchestrator();
    const out = await orchestrator.run(target(), { isFinalAttempt: false });
    expect(out.kind).toBe('done');
    if (out.kind !== 'done') return;
    const u = out.update;

    expect(u.analysisStatus).toBe('completed');
    expect(u.analysisErrors).toEqual([]);
    expect(u.technology).toMatchObject({
      cms: 'WordPress',
      builder: 'Elementor',
      cdn: 'Cloudflare',
    });
    expect(u.performance).toMatchObject({
      performanceStatus: 'ok',
      mobileScore: 27,
      desktopScore: 71,
    });
    expect(u.features.onlineBooking.bookingQuality).toBe('none');
    expect(u.features.whatsapp.status).toBe('no');
    expect(u.features.chatbot.status).toBe('no');
    expect(u.features.aiAssistant.status).toBe('notDetected');
    expect(u.features.contactForm.status).toBe('yes');
    expect(u.features.onlinePayment.status).toBe('no');
    expect(u.copyrightYear).toBe(2018);
    expect(u.isHttps).toBe(true);
    expect(u.email).toBe('info@sunshinecarrental.com');
    expect(u.instagramUrl).toBe('https://www.instagram.com/sunshinecarrental/');
    expect(['poor', 'average']).toContain(u.websiteQuality);

    // Score: website + performance(10+6+2) + booking 15 + automation(5+4+3+3) + reviews 3 + rating 2 + instagram 3
    const sum = u.scoreBreakdown.reduce((s, b) => s + b.points, 0);
    expect(u.score).toBe(sum);
    expect(u.score).toBeGreaterThanOrEqual(60);
    expect(u.priority === 'hot' || u.priority === 'high').toBe(true);
    for (const b of u.scoreBreakdown) expect(b.evidence).toBeTruthy();

    const titles = u.opportunities.map((o) => o.title);
    expect(titles).toContain('Modern rental website with online booking');
    expect(titles).toContain('WhatsApp inquiry and follow up automation');
    expect(titles.some((t) => t.startsWith('AI assistant for common rental questions'))).toBe(true);
    expect(u.stageDurations.map((d) => d.stage)).toEqual(
      expect.arrayContaining(['fetchPage', 'pageSpeed', 'bookingDetector', 'scoring']),
    );
  });

  it('detects good booking + Stripe and lowers the booking opportunity', async () => {
    intercept('/robots.txt', 404, '');
    intercept('/', 200, fixture('booking-form.html'));
    const { orchestrator } = makeOrchestrator({ detectBooking: fakeBooking('booking-form.html') });
    const out = await orchestrator.run(target({ businessName: 'Bay Area Prestige Rentals' }), {
      isFinalAttempt: false,
    });
    if (out.kind !== 'done') throw new Error('expected done');
    expect(out.update.features.onlineBooking.bookingQuality).toBe('good');
    expect(out.update.features.onlinePayment.status).toBe('yes');
    expect(out.update.features.automatedFollowUp.status).toBe('yes');
    expect(
      out.update.scoreBreakdown.find((b) => b.rule === 'attractiveness.luxuryKeyword')?.evidence,
    ).toContain('prestige');
    expect(out.update.opportunities.map((o) => o.serviceType)).not.toContain('booking');
  });

  it('asks for a retry on 429, and records "blocked" after the final attempt', async () => {
    intercept('/robots.txt', 200, '', { 'content-type': 'text/plain' });
    intercept('/', 429, 'slow down');
    const { orchestrator } = makeOrchestrator();
    expect(await orchestrator.run(target(), { isFinalAttempt: false })).toEqual({
      kind: 'retry',
      reason: 'Site responded 429',
    });

    intercept('/', 429, 'slow down');
    const out = await orchestrator.run(target(), { isFinalAttempt: true });
    if (out.kind !== 'done') throw new Error('expected done');
    expect(out.update.analysisStatus).toBe('blocked');
    expect(out.update.analysisErrors[0]?.message).toMatch(/RATE_LIMITED/);
  });

  it('respects robots.txt: blocked, and no PageSpeed or browser calls', async () => {
    intercept('/robots.txt', 200, 'User-agent: *\nDisallow: /\n', { 'content-type': 'text/plain' });
    const detectBooking = fakeBooking('wordpress-elementor.html');
    const { orchestrator, http } = makeOrchestrator({ detectBooking });
    const out = await orchestrator.run(target(), { isFinalAttempt: false });
    if (out.kind !== 'done') throw new Error('expected done');
    expect(out.update.analysisStatus).toBe('blocked');
    expect(out.update.websiteQuality).toBe('unknown');
    expect(out.update.features.whatsapp.status).toBe('unknown');
    expect(http).not.toHaveBeenCalled();
    expect(detectBooking).not.toHaveBeenCalled();
  });

  it('isolates stage failures: PageSpeed throws, everything else still runs', async () => {
    intercept('/robots.txt', 404, '');
    intercept('/', 200, fixture('whatsapp.html'));
    const { orchestrator } = makeOrchestrator({
      pageSpeed: async () => {
        throw new Error('PSI exploded');
      },
      detectBooking: fakeBooking('whatsapp.html'),
    });
    const out = await orchestrator.run(target(), { isFinalAttempt: false });
    if (out.kind !== 'done') throw new Error('expected done');
    expect(out.update.analysisStatus).toBe('partial');
    expect(out.update.analysisErrors).toEqual([
      expect.objectContaining({ stage: 'pageSpeed', message: 'PSI exploded' }),
    ]);
    expect(out.update.performance.performanceStatus).toBe('unavailable');
    expect(out.update.scoreNotes).toContain(
      'Performance data unavailable; performance category scored 0.',
    );
    expect(out.update.features.whatsapp.status).toBe('yes');
    expect(out.update.copyrightYear).toBe(2023);
  });

  it('without a browser, chat and booking stay unknown (never "no")', async () => {
    intercept('/robots.txt', 404, '');
    intercept('/', 200, fixture('wordpress-elementor.html'));
    const { orchestrator } = makeOrchestrator({ detectBooking: null });
    const out = await orchestrator.run(target(), { isFinalAttempt: false });
    if (out.kind !== 'done') throw new Error('expected done');
    expect(out.update.features.chatbot.status).toBe('unknown');
    expect(out.update.features.onlineBooking.bookingQuality).toBe('unknown');
    expect(out.update.features.whatsapp.status).toBe('no');
    expect(out.update.analysisStatus).toBe('partial');
  });

  it('no website: quality "none" without guessing a site', async () => {
    const { orchestrator, http } = makeOrchestrator();
    const out = await orchestrator.run(target({ website: null }), { isFinalAttempt: false });
    if (out.kind !== 'done') throw new Error('expected done');
    expect(out.update.websiteQuality).toBe('none');
    expect(out.update.analysisStatus).toBe('completed');
    expect(out.update.scoreBreakdown.find((b) => b.rule === 'website.none')?.points).toBe(30);
    expect(out.update.opportunities[0]?.title).toBe(
      'Professional rental website with online booking',
    );
    expect(http).not.toHaveBeenCalled();
  });
});
