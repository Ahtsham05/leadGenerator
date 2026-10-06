import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../app.js';
import { MemoryLeadRepository } from '../../test/helpers/memoryRepo.js';
import { silentLogger } from '../../test/helpers/silentLogger.js';

const TOKEN = 'test-token-0123456789abcdef';
const auth = { Authorization: `Bearer ${TOKEN}` };

function setup() {
  const repo = new MemoryLeadRepository();
  const enqueue = vi.fn(async () => ({ jobId: 'job-1' }));
  const app = createApp({
    config: {
      adminToken: TOKEN,
      webOrigin: ['http://localhost:5173'],
      env: 'test',
      browser: { uploadsDir: './uploads' },
    },
    logger: silentLogger,
    repo,
    enqueue,
    healthChecks: { mongo: async () => true, redis: async () => true },
    hostGuard: async (h) => {
      if (h === 'internal.example')
        throw Object.assign(new Error('resolves to private address 10.0.0.5'), {
          name: 'UnsafeHostError',
        });
    },
  });
  return { app, repo, enqueue };
}

describe('API', () => {
  let ctx: ReturnType<typeof setup>;
  beforeEach(() => {
    ctx = setup();
  });

  it('health is public', async () => {
    const r = await request(ctx.app).get('/api/health');
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ status: 'ok', services: { mongo: 'up', redis: 'up' } });
  });

  it('requires a bearer token', async () => {
    expect((await request(ctx.app).get('/api/leads')).status).toBe(401);
    const bad = await request(ctx.app).get('/api/leads').set('Authorization', 'Bearer wrong');
    expect(bad.status).toBe(401);
    expect(bad.body).toEqual({
      error: { code: 'UNAUTHORIZED', message: 'Missing or invalid bearer token' },
    });
  });

  it('POST /analyze creates a lead and enqueues analysis', async () => {
    const r = await request(ctx.app)
      .post('/api/leads/analyze')
      .set(auth)
      .send({
        businessName: 'Miami Exotic',
        website: 'www.MiamiExotic.example/',
        city: 'Miami',
        reviewCount: 120,
      });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ jobId: 'job-1', analysisStatus: 'pending', enqueued: true });
    const lead = await ctx.repo.findById(r.body.id);
    expect(lead?.website).toBe('https://www.miamiexotic.example/');
    expect(ctx.enqueue).toHaveBeenCalledWith(r.body.id);

    const again = await request(ctx.app)
      .post('/api/leads/analyze')
      .set(auth)
      .send({ businessName: 'Miami Exotic', website: 'https://miamiexotic.example' });
    expect(again.status).toBe(202);
    expect(again.body.id).toBe(r.body.id);
  });

  it('POST /analyze validates the body', async () => {
    const r = await request(ctx.app)
      .post('/api/leads/analyze')
      .set(auth)
      .send({ website: 'x.com' });
    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe('VALIDATION_ERROR');
    expect(r.body.error.details[0].path).toBe('businessName');
  });

  it('POST /analyze rejects unsafe URLs', async () => {
    for (const website of [
      'file:///etc/passwd',
      'http://localhost:8080',
      'http://internal.example',
    ]) {
      const r = await request(ctx.app)
        .post('/api/leads/analyze')
        .set(auth)
        .send({ businessName: 'X', website });
      expect(r.status, website).toBe(400);
    }
    expect(ctx.enqueue).not.toHaveBeenCalled();
  });

  it('malformed JSON gets a consistent error shape', async () => {
    const r = await request(ctx.app)
      .post('/api/leads/analyze')
      .set(auth)
      .set('content-type', 'application/json')
      .send('{bad');
    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe('BAD_REQUEST');
  });

  it('GET /leads/:id returns 404 or the lead', async () => {
    expect(
      (await request(ctx.app).get('/api/leads/000000000000000000000000').set(auth)).status,
    ).toBe(404);
    expect((await request(ctx.app).get('/api/leads/not-an-id').set(auth)).status).toBe(400);
    const { lead } = await ctx.repo.upsertManual({
      businessName: 'A',
      website: 'https://a.example/',
      websiteKey: 'a.example',
    });
    const r = await request(ctx.app).get(`/api/leads/${lead.id}`).set(auth);
    expect(r.status).toBe(200);
    expect(r.body.businessName).toBe('A');
  });

  it('GET /leads paginates and validates the query', async () => {
    await ctx.repo.upsertManual({
      businessName: 'A',
      website: 'https://a.example/',
      websiteKey: 'a.example',
    });
    const r = await request(ctx.app).get('/api/leads?page=1&pageSize=10&priority=hot').set(auth);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ page: 1, pageSize: 10, total: 1 });
    expect((await request(ctx.app).get('/api/leads?priority=urgent').set(auth)).status).toBe(400);
  });

  it('unknown routes return the error shape', async () => {
    const r = await request(ctx.app).get('/api/nope').set(auth);
    expect(r.status).toBe(404);
    expect(r.body.error.code).toBe('NOT_FOUND');
  });

  it('sets security headers', async () => {
    const r = await request(ctx.app).get('/api/health');
    expect(r.headers['x-content-type-options']).toBe('nosniff');
    expect(r.headers['x-powered-by']).toBeUndefined();
  });
});
