import { Agent } from 'undici';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { allowAll, html, redirect, startServer, text } from '../../test/helpers/testServer.js';
import { fixture } from '../../test/fixtures.js';
import { fetchPage, type FetchPageOptions } from './fetchPage.js';
import { assertPublicHost } from './net/urlSafety.js';

/** Allows only the local test server; everything else goes through the real SSRF guard. */
const onlyTestServer = async (host: string) =>
  host === '127.0.0.1' ? undefined : assertPublicHost(host);

const dispatcher = new Agent();
let srv: Awaited<ReturnType<typeof startServer>>;
const opts = (over: Partial<FetchPageOptions> = {}): FetchPageOptions => ({
  timeoutMs: 3000,
  userAgent: 'LeadIntelBot/0.1 (+test)',
  maxBytes: 64 * 1024,
  hostGuard: allowAll,
  dispatcher,
  ...over,
});

beforeAll(async () => {
  srv = await startServer({
    '/robots.txt': text('User-agent: *\nDisallow: /private\n'),
    '/': html(fixture('wordpress-elementor.html'), 200, {
      server: 'cloudflare',
      'set-cookie': '__cf_bm=x; Path=/',
    }),
    '/r1': redirect('/r2'),
    '/r2': redirect('/'),
    '/loop': redirect('/loop'),
    '/private': html('<p>secret</p>'),
    '/to-private': redirect('/private'),
    '/big': html(`<html><body>${'x'.repeat(200_000)}</body></html>`),
    '/limited': html('slow down', 429),
    '/challenge': html(
      '<html><head><title>Just a moment...</title></head><body>cf_chl_opt</body></html>',
      403,
    ),
    '/forbidden': html('no', 403),
    '/pdf': (_req, res) => {
      res.writeHead(200, { 'content-type': 'application/pdf' });
      res.end('%PDF');
    },
    '/slow': (_req, res) => {
      setTimeout(() => html('late')(_req, res), 2000);
    },
    '/to-metadata': redirect('http://169.254.169.254/latest/meta-data'),
  });
});
afterAll(async () => {
  await srv.close();
  await dispatcher.close();
});

describe('fetchPage', () => {
  it('fetches HTML with headers, cookies and timing', async () => {
    const r = await fetchPage(`${srv.url}/`, opts());
    expect(r.ok).toBe(true);
    expect(r.status).toBe(200);
    expect(r.headers.server).toBe('cloudflare');
    expect(r.setCookies[0]).toMatch(/^__cf_bm=/);
    expect(r.html).toContain('Sunshine Car Rental');
    expect(r.timing.totalMs).toBeGreaterThanOrEqual(0);
  });

  it('follows redirects and reports the final URL', async () => {
    const r = await fetchPage(`${srv.url}/r1`, opts());
    expect(r.ok).toBe(true);
    expect(r.finalUrl).toBe(`${srv.url}/`);
    expect(r.redirects).toHaveLength(2);
  });

  it('stops after too many redirects', async () => {
    const r = await fetchPage(`${srv.url}/loop`, opts());
    expect(r.error?.code).toBe('TOO_MANY_REDIRECTS');
  });

  it('honours robots.txt, including on redirect targets', async () => {
    expect((await fetchPage(`${srv.url}/private`, opts())).error?.code).toBe('ROBOTS_DISALLOWED');
    const r = await fetchPage(`${srv.url}/to-private`, opts());
    expect(r.error?.code).toBe('ROBOTS_DISALLOWED');
    expect(r.blocked).toBe(true);
  });

  it('caps the body size', async () => {
    const r = await fetchPage(`${srv.url}/big`, opts({ maxBytes: 10_000 }));
    expect(r.ok).toBe(true);
    expect(r.truncated).toBe(true);
    expect(r.html?.length).toBeLessThanOrEqual(10_000);
  });

  it('classifies 429 as rate limited, challenges and 403 as blocked', async () => {
    expect((await fetchPage(`${srv.url}/limited`, opts())).error?.code).toBe('RATE_LIMITED');
    const ch = await fetchPage(`${srv.url}/challenge`, opts());
    expect(ch).toMatchObject({ blocked: true, error: { code: 'BLOCKED' } });
    expect((await fetchPage(`${srv.url}/forbidden`, opts())).blocked).toBe(true);
  });

  it('rejects non-HTML', async () => {
    expect((await fetchPage(`${srv.url}/pdf`, opts())).error?.code).toBe('NOT_HTML');
  });

  it('times out', async () => {
    const r = await fetchPage(`${srv.url}/slow`, opts({ timeoutMs: 300, respectRobots: false }));
    expect(r.error?.code).toBe('TIMEOUT');
  });

  it('SSRF: default guard rejects loopback, and redirects to metadata IPs are rejected', async () => {
    const r = await fetchPage(`${srv.url}/`, opts({ hostGuard: undefined }));
    expect(r.error?.code).toBe('UNSAFE_HOST');
    const m = await fetchPage(`${srv.url}/to-metadata`, opts({ hostGuard: onlyTestServer }));
    expect(m.error?.code).toBe('UNSAFE_HOST');
  });

  it('rejects invalid schemes before any request', async () => {
    expect((await fetchPage('file:///etc/passwd', opts())).error?.code).toBe('INVALID_URL');
  });
});
