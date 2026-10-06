import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Agent } from 'undici';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { fixture } from '../../../test/fixtures.js';
import { html, startServer, text } from '../../../test/helpers/testServer.js';
import { silentLogger } from '../../../test/helpers/silentLogger.js';
import { detectChatbot } from '../chatbotDetector.js';
import { RobotsChecker } from '../net/robotsChecker.js';
import { BrowserPool } from './browserPool.js';
import { detectBooking } from './bookingDetector.js';

const HOME = `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>Test Rentals</title></head>
<body>
  <nav><a href="/reserve">Book now</a> <a href="/private-booking">Reservations</a> <a href="/contact">Contact us</a> <a href="https://other.example/book">Partner</a></nav>
  <div style="width:1200px">wide banner</div>
  <script>
    var s = document.createElement('script'); s.src = 'https://code.tidio.co/abc123.js'; s.async = true; document.head.appendChild(s);
  </script>
</body></html>`;

const CONTACT = `<!doctype html><html><body><form><input name="name"><input type="email" name="email"><textarea name="message"></textarea><button>Send</button></form></body></html>`;

let srv: Awaited<ReturnType<typeof startServer>>;
let pool: BrowserPool;
let uploads: string;
const dispatcher = new Agent();
const onlyLocal = async (h: string) => {
  if (h !== '127.0.0.1') throw new Error(`blocked ${h} in test`);
};

beforeAll(async () => {
  srv = await startServer({
    '/robots.txt': text('User-agent: *\nDisallow: /private-booking\n'),
    '/': html(HOME),
    '/reserve': html(fixture('booking-form.html')),
    '/private-booking': html('<p>should never be visited</p>'),
    '/contact': html(CONTACT),
  });
  // Playwright forces loopback through any configured proxy; the test server is local.
  pool = new BrowserPool({ size: 1, logger: silentLogger, useEnvProxy: false });
  uploads = mkdtempSync(path.join(tmpdir(), 'lead-uploads-'));
});
afterAll(async () => {
  await pool.close();
  await srv.close();
  await dispatcher.close();
  rmSync(uploads, { recursive: true, force: true });
});

describe('Playwright site inspection', () => {
  it('renders, screenshots, follows booking links politely and classifies booking', async () => {
    const robots = new RobotsChecker({
      userAgent: 'LeadIntelBot/0.1',
      dispatcher,
      hostGuard: onlyLocal,
    });
    const r = await detectBooking(`${srv.url}/`, 'lead123', {
      pool,
      robots,
      userAgent: 'LeadIntelBot/0.1 (+test)',
      pageTimeoutMs: 15000,
      uploadsDir: uploads,
      logger: silentLogger,
      hostGuard: onlyLocal,
      interPageDelayMs: [0, 0],
    });
    expect(r.error).toBeNull();
    const insp = r.inspection!;
    expect(insp.homepage.ok).toBe(true);
    expect(insp.homepage.hasViewportMeta).toBe(true);
    expect(insp.homepage.horizontalOverflowPx).toBeGreaterThan(500);
    expect(insp.homepage.screenshotPath).toMatch(/^screenshots\/lead123-mobile-\d+\.png$/);
    expect(existsSync(path.join(uploads, insp.homepage.screenshotPath!))).toBe(true);

    // robots-disallowed link was skipped and never fetched; off-site link ignored.
    expect(srv.hits).not.toContain('/private-booking');
    expect(insp.skipped.map((s) => s.url)).toContain(`${srv.url}/private-booking`);
    expect(insp.contactPageInspected).toBe(true);

    // Booking: the /reserve page has a full booking form, but a disallowed booking page means
    // the inspection is incomplete; a positive finding is still reported.
    expect(r.booking.bookingQuality).toBe('good');
    expect(r.booking.bookingUrl).toBe(`${srv.url}/reserve`);

    // Script-injected widget is visible only in the rendered DOM.
    const chat = detectChatbot({
      static: null,
      staticComplete: false,
      rendered: insp.homepage.assets,
    });
    expect(chat.chatbot.chatbotProvider).toBe('Tidio');
  }, 60_000);

  it('never throws: an unreachable site yields "unknown"', async () => {
    const robots = new RobotsChecker({
      userAgent: 'LeadIntelBot/0.1',
      dispatcher,
      hostGuard: onlyLocal,
    });
    const r = await detectBooking('http://127.0.0.1:1/', 'lead456', {
      pool,
      robots,
      userAgent: 'LeadIntelBot/0.1',
      pageTimeoutMs: 5000,
      uploadsDir: uploads,
      logger: silentLogger,
      hostGuard: onlyLocal,
    });
    expect(r.booking.bookingQuality).toBe('unknown');
    expect(r.error).toBeTruthy();
  }, 30_000);
});
