import { Router } from 'express';

export type HealthCheck = () => Promise<boolean>;

/** Public, minimal health endpoint (no internal details exposed). */
export function healthRouter(checks: Record<string, HealthCheck>): Router {
  const r = Router();
  r.get('/', async (_req, res) => {
    const entries = await Promise.all(
      Object.entries(checks).map(
        async ([name, check]) => [name, await check().catch(() => false)] as const,
      ),
    );
    const services = Object.fromEntries(entries.map(([n, ok]) => [n, ok ? 'up' : 'down']));
    const ok = entries.every(([, v]) => v);
    res.status(ok ? 200 : 503).json({ status: ok ? 'ok' : 'degraded', services });
  });
  return r;
}
