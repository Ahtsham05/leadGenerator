import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import type { BrowserContext, Frame, Page } from 'playwright';
import type { Logger } from '../../lib/logger.js';
import { randomBetween, sleep } from '../../lib/sleep.js';
import { looksLikeChallenge } from '../fetchPage.js';
import { extractAssets, type PageAssets } from '../html/extractAssets.js';
import type { RobotsChecker } from '../net/robotsChecker.js';
import { assertPublicHost, isSameSite, normalizeUrl, type HostGuard } from '../net/urlSafety.js';
import type { BookingObservation, InspectedPage } from './bookingClassifier.js';
import { BOOKING_HREF_RE, BOOKING_LINK_RE, CONTACT_LINK_RE } from './bookingPlatforms.js';
import type { BrowserPool } from './browserPool.js';

export interface SiteInspectorOptions {
  pool: BrowserPool;
  robots: RobotsChecker;
  userAgent: string;
  pageTimeoutMs: number;
  uploadsDir: string;
  logger: Logger;
  hostGuard?: HostGuard;
  maxBookingPages?: number;
  /** Delay between page visits on the same site. */
  interPageDelayMs?: [number, number];
  signal?: AbortSignal;
}

export interface HomepageRender {
  ok: boolean;
  finalUrl: string | null;
  status: number | null;
  assets: PageAssets | null;
  hasViewportMeta: boolean | null;
  /** scrollWidth - innerWidth at a 390px viewport; > 0 means horizontal overflow. */
  horizontalOverflowPx: number | null;
  screenshotPath: string | null;
  blocked: boolean;
  error: string | null;
}

export interface SiteInspection {
  homepage: HomepageRender;
  observation: BookingObservation;
  /** Rendered booking/contact pages (for presence detectors). */
  extraPages: PageAssets[];
  contactPageInspected: boolean | null;
  skipped: Array<{ url: string; reason: string }>;
}

const MOBILE_VIEWPORT = { width: 390, height: 844 };

function sameSiteCandidates(home: PageAssets, baseUrl: string, max: number) {
  const seen = new Set<string>([stripHash(baseUrl)]);
  const booking: string[] = [];
  let contact: string | null = null;
  for (const a of home.anchors) {
    if (!a.url || !/^https?:/i.test(a.url)) continue;
    let u: URL;
    try {
      u = new URL(a.url);
    } catch {
      continue;
    }
    if (!isSameSite(baseUrl, u)) continue;
    if (/\.(?:pdf|jpe?g|png|gif|webp|zip|docx?)$/i.test(u.pathname)) continue;
    const key = stripHash(u.toString());
    if (seen.has(key)) continue;
    const isBooking = BOOKING_LINK_RE.test(a.text) || BOOKING_HREF_RE.test(u.pathname + u.search);
    if (isBooking && booking.length < max) {
      booking.push(key);
      seen.add(key);
    } else if (!contact && (CONTACT_LINK_RE.test(a.text) || /\/contact/i.test(u.pathname))) {
      contact = key;
      seen.add(key);
    }
  }
  return { booking, contact };
}

function stripHash(u: string): string {
  const x = new URL(u);
  x.hash = '';
  return x.toString();
}

async function settle(page: Page, idleMs: number, extraMs: number): Promise<void> {
  await page.waitForLoadState('networkidle', { timeout: idleMs }).catch(() => undefined);
  if (extraMs > 0) await page.waitForTimeout(extraMs);
}

async function inspectFrames(page: Page, timeoutMs: number) {
  const frames: PageAssets[] = [];
  const uninspectable: string[] = [];
  const children = page.frames().filter((f: Frame) => f !== page.mainFrame());
  for (const f of children.slice(0, 10)) {
    const url = f.url();
    if (
      !/^https?:/i.test(url) ||
      /googletagmanager|doubleclick|facebook\.com\/tr|recaptcha|youtube\.com|google\.com\/maps/i.test(
        url,
      )
    )
      continue;
    try {
      const html = await Promise.race([
        f.content(),
        new Promise<never>((_, rej) =>
          setTimeout(() => rej(new Error('frame timeout')), timeoutMs),
        ),
      ]);
      frames.push(extractAssets(html, url));
    } catch {
      uninspectable.push(url);
    }
  }
  return { frames, uninspectable };
}

/**
 * Renders the homepage at a mobile viewport, then visits up to N same-site booking
 * links and one contact page. Never submits forms, never logs in, never solves challenges.
 */
export async function inspectSite(
  url: string,
  leadId: string,
  opts: SiteInspectorOptions,
): Promise<SiteInspection> {
  const guard = opts.hostGuard ?? assertPublicHost;
  const maxBooking = opts.maxBookingPages ?? 5;
  const [dMin, dMax] = opts.interPageDelayMs ?? [750, 1500];
  const hostCache = new Map<string, Promise<boolean>>();
  const hostAllowed = (host: string) => {
    let p = hostCache.get(host);
    if (!p) {
      p = guard(host).then(
        () => true,
        () => false,
      );
      hostCache.set(host, p);
    }
    return p;
  };

  const homepage: HomepageRender = {
    ok: false,
    finalUrl: null,
    status: null,
    assets: null,
    hasViewportMeta: null,
    horizontalOverflowPx: null,
    screenshotPath: null,
    blocked: false,
    error: null,
  };
  const pages: InspectedPage[] = [];
  const skipped: SiteInspection['skipped'] = [];
  let contactPageInspected: boolean | null = null;
  let complete = true;

  await opts.pool.withContext(
    {
      viewport: MOBILE_VIEWPORT,
      isMobile: true,
      hasTouch: true,
      deviceScaleFactor: 2,
      userAgent: opts.userAgent,
      serviceWorkers: 'block',
      acceptDownloads: false,
      locale: 'en-US',
    },
    async (context: BrowserContext) => {
      // SSRF protection for every request the page makes, not just navigations.
      await context.route('**/*', async (route) => {
        const req = route.request();
        let u: URL;
        try {
          u = new URL(req.url());
        } catch {
          return route.abort();
        }
        if (u.protocol === 'data:' || u.protocol === 'blob:') return route.continue();
        if (u.protocol !== 'http:' && u.protocol !== 'https:') return route.abort();
        if (req.resourceType() === 'media') return route.abort();
        if (!(await hostAllowed(u.hostname))) return route.abort('blockedbyclient');
        return route.continue();
      });

      const page = await context.newPage();
      page.setDefaultTimeout(opts.pageTimeoutMs);
      page.setDefaultNavigationTimeout(opts.pageTimeoutMs);

      // ---- Homepage
      try {
        const resp = await page.goto(url, {
          waitUntil: 'domcontentloaded',
          timeout: opts.pageTimeoutMs,
        });
        homepage.status = resp?.status() ?? null;
        await settle(page, 6000, 1500);
        homepage.finalUrl = page.url();
        const html = await page.content();
        if (
          looksLikeChallenge(html, homepage.status ?? 200) ||
          homepage.status === 403 ||
          homepage.status === 401
        ) {
          homepage.blocked = true;
          homepage.error = `Anti-bot or access refusal (status ${homepage.status})`;
          return;
        }
        if (homepage.status !== null && homepage.status >= 400) {
          homepage.error = `Homepage responded ${homepage.status}`;
          return;
        }
        homepage.assets = extractAssets(html, homepage.finalUrl);
        homepage.hasViewportMeta = homepage.assets.hasViewportMeta;
        // Compare against the emulated device width: mobile emulation zooms the visual
        // viewport out to fit wide content, so window.innerWidth is not reliable here.
        const scrollWidth = await page.evaluate(() =>
          Math.max(document.documentElement.scrollWidth, document.body?.scrollWidth ?? 0),
        );
        homepage.horizontalOverflowPx = Math.max(0, scrollWidth - MOBILE_VIEWPORT.width);
        try {
          const dir = path.join(opts.uploadsDir, 'screenshots');
          await mkdir(dir, { recursive: true });
          const file = path.join(dir, `${leadId}-mobile-${Date.now()}.png`);
          await page.screenshot({ path: file, fullPage: false, timeout: 10000 });
          homepage.screenshotPath = path.relative(opts.uploadsDir, file).split(path.sep).join('/');
        } catch (err) {
          opts.logger.debug({ err, leadId }, 'screenshot failed');
        }
        const fr = await inspectFrames(page, 5000);
        pages.push({
          url: homepage.finalUrl,
          role: 'homepage',
          assets: homepage.assets,
          frames: fr.frames,
          uninspectableFrames: fr.uninspectable,
          loginWall: false,
        });
        homepage.ok = true;
      } catch (err) {
        homepage.error =
          err instanceof Error ? (err.message.split('\n')[0] ?? 'navigation failed') : String(err);
        return;
      }

      // ---- Candidate pages
      const { booking, contact } = sameSiteCandidates(
        homepage.assets,
        homepage.finalUrl ?? url,
        maxBooking,
      );
      const targets: Array<{ url: string; role: 'booking' | 'contact' }> = [
        ...booking.map((u) => ({ url: u, role: 'booking' as const })),
        ...(contact ? [{ url: contact, role: 'contact' as const }] : []),
      ];
      if (contact) contactPageInspected = false;

      for (const t of targets) {
        if (opts.signal?.aborted) {
          complete = false;
          break;
        }
        const norm = normalizeUrl(t.url);
        if (!norm.ok) continue;
        const decision = await opts.robots.check(norm.url);
        if (!decision.allowed) {
          skipped.push({ url: t.url, reason: decision.reason });
          if (t.role === 'booking') complete = false;
          continue;
        }
        await sleep(randomBetween(dMin, dMax), opts.signal).catch(() => undefined);
        try {
          const resp = await page.goto(norm.url.toString(), {
            waitUntil: 'domcontentloaded',
            timeout: opts.pageTimeoutMs,
          });
          await settle(page, 4000, 500);
          const status = resp?.status() ?? null;
          const html = await page.content();
          if ((status !== null && status >= 400) || looksLikeChallenge(html, status ?? 200)) {
            skipped.push({ url: t.url, reason: `status ${status}` });
            if (t.role === 'booking' && status !== 404) complete = false;
            continue;
          }
          const assets = extractAssets(html, page.url());
          const fr = await inspectFrames(page, 5000);
          const passwordFields = [
            ...assets.forms.flatMap((f) => f.fields),
            ...assets.looseFields,
          ].filter((f) => f.type === 'password').length;
          const otherForms = assets.forms.filter(
            (f) => !f.fields.some((x) => x.type === 'password'),
          ).length;
          pages.push({
            url: page.url(),
            role: t.role,
            assets,
            frames: fr.frames,
            uninspectableFrames: fr.uninspectable,
            loginWall: passwordFields > 0 && otherForms === 0,
          });
          if (t.role === 'contact') contactPageInspected = true;
        } catch (err) {
          skipped.push({
            url: t.url,
            reason: err instanceof Error ? (err.message.split('\n')[0] ?? 'failed') : 'failed',
          });
          if (t.role === 'booking') complete = false;
        }
      }
    },
  );

  return {
    homepage,
    observation: {
      homepageInspected: homepage.ok,
      homepageBlocked: homepage.blocked,
      homepageError: homepage.error,
      complete: homepage.ok && complete,
      pages,
    },
    extraPages: pages.filter((p) => p.role !== 'homepage').map((p) => p.assets),
    contactPageInspected,
    skipped,
  };
}
