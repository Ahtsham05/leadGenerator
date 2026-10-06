/**
 * End-to-end: HTTP API -> BullMQ (real Redis) -> worker -> orchestrator with real fetchPage
 * and real Chromium against a local site -> GET lead. MongoDB is replaced by the in-memory
 * repository. Runs only when REDIS_TEST_URL is set (e.g. redis://127.0.0.1:6379/15).
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { Agent } from 'undici';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { BrowserPool } from '../../src/analyzers/booking/browserPool.js';
import { detectBooking } from '../../src/analyzers/booking/bookingDetector.js';
import { fetchPage } from '../../src/analyzers/fetchPage.js';
import { RobotsChecker } from '../../src/analyzers/net/robotsChecker.js';
import { analyzePageSpeed } from '../../src/analyzers/pageSpeedAnalyzer.js';
import { SignatureTechDetector } from '../../src/analyzers/tech/techDetector.js';
import { AnalysisOrchestrator } from '../../src/orchestrator/analysisOrchestrator.js';
import { createAnalysisProcessor } from '../../src/queue/analysisProcessor.js';
import { createAnalysisQueue, makeEnqueue } from '../../src/queue/analysisQueue.js';
import { createAnalysisWorker } from '../../src/queue/analysisWorker.js';
import { createRedisConnection } from '../../src/queue/redis.js';
import { fixture, fixtureJson } from '../fixtures.js';
import { MemoryLeadRepository } from '../helpers/memoryRepo.js';
import { silentLogger } from '../helpers/silentLogger.js';
import { html, startServer, text } from '../helpers/testServer.js';

const REDIS = process.env.REDIS_TEST_URL;
const TOKEN = 'e2e-token-0123456789abcdef';
const UA = 'LeadIntelBot/0.1 (+e2e)';

describe.skipIf(!REDIS)('analyze flow (e2e)', () => {
  const dispatcher = new Agent();
  const onlyLocal = async (h: string) => {
    if (h !== '127.0.0.1') throw new Error(`blocked ${h}`);
  };
  let site: Awaited<ReturnType<typeof startServer>>;
  let pool: BrowserPool;
  let uploads: string;
  let cleanup: Array<() => Promise<unknown>> = [];
  let app: ReturnType<typeof createApp>;
  let repo: MemoryLeadRepository;

  beforeAll(async () => {
    site = await startServer({
      '/robots.txt': text('User-agent: *\nAllow: /\n'),
      '/': html(
        fixture('wordpress-elementor.html').replaceAll('https://sunshinecarrental.com', ''),
      ),
    });
    uploads = mkdtempSync(path.join(tmpdir(), 'e2e-uploads-'));
    pool = new BrowserPool({ size: 1, logger: silentLogger, useEnvProxy: false });
    repo = new MemoryLeadRepository();
    const robots = new RobotsChecker({ userAgent: UA, dispatcher, hostGuard: onlyLocal });
    const orchestrator = new AnalysisOrchestrator({
      logger: silentLogger,
      techProvider: new SignatureTechDetector(),
      fetchPage: (url, signal) =>
        fetchPage(url, {
          timeoutMs: 5000,
          userAgent: UA,
          maxBytes: 3_000_000,
          dispatcher,
          hostGuard: onlyLocal,
          robots,
          signal,
        }),
      pageSpeed: (url) =>
        analyzePageSpeed(url, {
          timeoutMs: 2000,
          httpGetJson: async (u) => ({
            status: 200,
            json: fixtureJson(
              new URL(u).searchParams.get('strategy') === 'mobile'
                ? 'psi-mobile.json'
                : 'psi-desktop-no-field.json',
            ),
          }),
        }),
      detectBooking: (url, leadId, signal) =>
        detectBooking(url, leadId, {
          pool,
          robots,
          userAgent: UA,
          pageTimeoutMs: 15000,
          uploadsDir: uploads,
          logger: silentLogger,
          hostGuard: onlyLocal,
          interPageDelayMs: [0, 0],
          signal,
        }),
    });
    const queueConn = createRedisConnection(REDIS!);
    const workerConn = createRedisConnection(REDIS!);
    const queue = createAnalysisQueue(queueConn);
    await queue.obliterate({ force: true }).catch(() => undefined);
    const processor = createAnalysisProcessor({
      repo,
      orchestrator,
      logger: silentLogger,
      minDelayMs: 0,
      maxDelayMs: 50,
      jobTimeoutMs: 60000,
    });
    const worker = createAnalysisWorker(
      workerConn,
      processor,
      { concurrency: 2, minDelayMs: 100 },
      silentLogger,
    );
    cleanup = [
      () => worker.close(),
      () => queue.obliterate({ force: true }),
      () => queue.close(),
      () => queueConn.quit(),
      () => workerConn.quit(),
      () => pool.close(),
      () => site.close(),
      () => dispatcher.close(),
    ];
    app = createApp({
      config: {
        adminToken: TOKEN,
        webOrigin: ['http://localhost:5173'],
        env: 'test',
        browser: { uploadsDir: uploads },
      },
      logger: silentLogger,
      repo,
      enqueue: makeEnqueue(queue, { retries: 2 }),
      healthChecks: { redis: async () => (await queueConn.ping()) === 'PONG' },
      hostGuard: onlyLocal,
    });
  }, 30_000);

  afterAll(async () => {
    for (const c of cleanup) await c().catch(() => undefined);
    rmSync(uploads, { recursive: true, force: true });
  });

  it('POST /analyze -> worker -> GET lead with full analysis', async () => {
    const auth = { Authorization: `Bearer ${TOKEN}` };
    const post = await request(app).post('/api/leads/analyze').set(auth).send({
      businessName: 'Sunshine Car Rental',
      website: site.url,
      city: 'Orlando',
      reviewCount: 240,
      rating: 4.6,
    });
    expect(post.status).toBe(201);
    const id: string = post.body.id;

    // Re-posting while the job is queued/active is de-duplicated by BullMQ.
    const again = await request(app)
      .post('/api/leads/analyze')
      .set(auth)
      .send({ businessName: 'Sunshine Car Rental', website: site.url });
    expect(again.body.jobId).toBe(post.body.jobId);

    let lead = (await request(app).get(`/api/leads/${id}`).set(auth)).body;
    const deadline = Date.now() + 60_000;
    while (
      !['completed', 'partial', 'failed', 'blocked'].includes(lead.analysisStatus) &&
      Date.now() < deadline
    ) {
      await new Promise((r) => setTimeout(r, 250));
      lead = (await request(app).get(`/api/leads/${id}`).set(auth)).body;
    }
    // E2E_DUMP=/path/lead.json writes the analysed lead for inspection.
    if (process.env.E2E_DUMP) writeFileSync(process.env.E2E_DUMP, JSON.stringify(lead, null, 2));
    expect(lead.analysisStatus).toBe('completed');
    expect(lead.technology.cms).toBe('WordPress');
    expect(lead.performance).toMatchObject({ mobileScore: 27, desktopScore: 71 });
    expect(lead.features.onlineBooking.bookingQuality).toBe('none');
    expect(lead.features.whatsapp.status).toBe('no');
    expect(lead.features.chatbot.status).toBe('no');
    expect(lead.screenshotPath).toMatch(/^screenshots\//);
    expect(lead.score).toBeGreaterThan(0);
    expect(lead.priority).toBeTruthy();
    expect(lead.scoreBreakdown.length).toBeGreaterThan(0);
    expect(lead.opportunities.length).toBeGreaterThan(0);

    // Screenshot is served behind auth.
    expect((await request(app).get(`/api/uploads/${lead.screenshotPath}`)).status).toBe(401);
    const shot = await request(app).get(`/api/uploads/${lead.screenshotPath}`).set(auth);
    expect(shot.status).toBe(200);
    expect(shot.headers['content-type']).toBe('image/png');
  }, 90_000);
});
