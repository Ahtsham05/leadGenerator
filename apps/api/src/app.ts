import path from 'node:path';
import cors from 'cors';
import express, { type Express } from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import type { HostGuard } from './analyzers/net/urlSafety.js';
import type { Config } from './config/env.js';
import type { Logger } from './lib/logger.js';
import { requireAdminToken } from './middleware/auth.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import type { Enqueue } from './queue/analysisQueue.js';
import { healthRouter, type HealthCheck } from './routes/health.js';
import { leadsRouter } from './routes/leads.js';
import type { LeadRepository } from './services/leadRepository.js';

export interface AppDeps {
  config: Pick<Config, 'adminToken' | 'webOrigin' | 'env'> & {
    browser: Pick<Config['browser'], 'uploadsDir'>;
  };
  logger: Logger;
  repo: LeadRepository;
  enqueue: Enqueue;
  healthChecks: Record<string, HealthCheck>;
  hostGuard?: HostGuard;
}

export function createApp(deps: AppDeps): Express {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(helmet());
  app.use(
    cors({
      origin: deps.config.webOrigin,
      methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
      credentials: false,
      allowedHeaders: ['Authorization', 'Content-Type'],
    }),
  );
  app.use(express.json({ limit: '100kb' }));
  app.use(
    pinoHttp({
      logger: deps.logger,
      autoLogging: { ignore: (req) => req.url === '/api/health' },
      customLogLevel: (_req, res, err) =>
        err || res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info',
      serializers: {
        req: (req: { method: string; url: string }) => ({ method: req.method, url: req.url }),
        res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
      },
    }),
  );

  app.use('/api/health', healthRouter(deps.healthChecks));

  const auth = requireAdminToken(deps.config.adminToken);
  app.use(
    '/api',
    rateLimit({
      windowMs: 15 * 60_000,
      limit: 600,
      standardHeaders: 'draft-7',
      legacyHeaders: false,
    }),
    auth,
  );
  app.use(
    '/api/leads',
    leadsRouter({ repo: deps.repo, enqueue: deps.enqueue, hostGuard: deps.hostGuard }),
  );
  // Screenshots and other analysis artefacts, behind auth.
  app.use(
    '/api/uploads',
    express.static(path.resolve(deps.config.browser.uploadsDir), {
      index: false,
      dotfiles: 'deny',
      fallthrough: false,
    }),
  );

  app.use(notFoundHandler);
  app.use(errorHandler(deps.logger));
  return app;
}
