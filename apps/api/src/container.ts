import mongoose from 'mongoose';
import type { Redis } from 'ioredis';
import { detectBooking } from './analyzers/booking/bookingDetector.js';
import { BrowserPool } from './analyzers/booking/browserPool.js';
import { fetchPage } from './analyzers/fetchPage.js';
import { RobotsChecker } from './analyzers/net/robotsChecker.js';
import { analyzePageSpeed } from './analyzers/pageSpeedAnalyzer.js';
import { SignatureTechDetector } from './analyzers/tech/techDetector.js';
import type { Config } from './config/env.js';
import type { Logger } from './lib/logger.js';
import { AnalysisOrchestrator } from './orchestrator/analysisOrchestrator.js';
import { createAnalysisProcessor } from './queue/analysisProcessor.js';
import { ApiUsageService } from './services/apiUsageService.js';
import { MongoLeadRepository } from './services/leadRepository.js';
import { MongoPageSpeedCache } from './services/pageSpeedCacheService.js';

/** Wires real implementations together. Tests build their own graphs with fakes. */
export function buildAnalysisStack(config: Config, logger: Logger) {
  const repo = new MongoLeadRepository();
  const usage = new ApiUsageService();
  const robots = new RobotsChecker({ userAgent: config.http.userAgent });
  const pool = config.browser.enabled
    ? new BrowserPool({
        size: config.browser.poolSize,
        executablePath: config.browser.executablePath,
        logger,
      })
    : null;
  const psiCache = new MongoPageSpeedCache(config.pageSpeed.cacheDays);

  const orchestrator = new AnalysisOrchestrator({
    logger,
    techProvider: new SignatureTechDetector(),
    fetchPage: (url, signal) =>
      fetchPage(url, {
        timeoutMs: config.http.timeoutMs,
        userAgent: config.http.userAgent,
        maxBytes: config.http.maxBytes,
        maxRedirects: 5,
        robots,
        signal,
      }),
    pageSpeed: (url, signal) =>
      analyzePageSpeed(url, {
        apiKey: config.keys.pageSpeed,
        timeoutMs: config.pageSpeed.timeoutMs,
        cache: psiCache,
        usage,
        signal,
      }),
    detectBooking: pool
      ? (url, leadId, signal) =>
          detectBooking(url, leadId, {
            pool,
            robots,
            userAgent: config.http.userAgent,
            pageTimeoutMs: config.browser.pageTimeoutMs,
            uploadsDir: config.browser.uploadsDir,
            logger,
            signal,
          })
      : null,
  });

  const processor = createAnalysisProcessor({
    repo,
    orchestrator,
    logger,
    minDelayMs: config.queue.minDelayMs,
    maxDelayMs: config.queue.maxDelayMs,
    jobTimeoutMs: config.queue.jobTimeoutMs,
  });

  return { repo, usage, pool, orchestrator, processor };
}

export async function connectMongo(uri: string, logger: Logger): Promise<void> {
  mongoose.set('strictQuery', true);
  mongoose.connection.on('disconnected', () => logger.warn('mongo disconnected'));
  mongoose.connection.on('reconnected', () => logger.info('mongo reconnected'));
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10_000 });
  // Ensure indexes exist (cheap no-op when already built).
  await Promise.all(
    Object.values(mongoose.models).map((m) =>
      m
        .syncIndexes()
        .catch((err: unknown) => logger.warn({ err, model: m.modelName }, 'index sync failed')),
    ),
  );
}

export const mongoHealthy = async () => mongoose.connection.readyState === 1;
export const redisHealthy = (redis: Redis) => async () => (await redis.ping()) === 'PONG';
