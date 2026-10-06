import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from './env.js';

const minimal = {
  MONGODB_URI: 'mongodb://localhost/x',
  REDIS_URL: 'redis://localhost:6379',
  ADMIN_ACCESS_TOKEN: 'x'.repeat(32),
};

describe('loadConfig', () => {
  it('applies documented defaults', () => {
    const c = loadConfig(minimal);
    expect(c.queue).toMatchObject({
      concurrency: 3,
      minDelayMs: 2000,
      maxDelayMs: 5000,
      retries: 2,
    });
    expect(c.http.timeoutMs).toBe(20000);
    expect(c.pageSpeed.cacheDays).toBe(7);
  });
  it('reports every invalid variable', () => {
    expect(() => loadConfig({ ADMIN_ACCESS_TOKEN: 'short' })).toThrow(ConfigError);
    try {
      loadConfig({ ADMIN_ACCESS_TOKEN: 'short' });
    } catch (e) {
      expect((e as Error).message).toMatch(/MONGODB_URI[\s\S]*REDIS_URL[\s\S]*ADMIN_ACCESS_TOKEN/);
    }
  });
  it('rejects max delay below min delay', () => {
    expect(() =>
      loadConfig({ ...minimal, ANALYSIS_MIN_DELAY_MS: '5000', ANALYSIS_MAX_DELAY_MS: '1000' }),
    ).toThrow(/MAX_DELAY/);
  });
  it('treats blank keys as absent', () => {
    expect(loadConfig({ ...minimal, GOOGLE_PLACES_API_KEY: '  ' }).keys.places).toBeUndefined();
  });
});
