import { createServer } from 'node:http';
import mongoose from 'mongoose';
import { createApp } from './app.js';
import { closeDispatchers } from './analyzers/net/httpDispatcher.js';
import { loadConfig } from './config/env.js';
import { buildAnalysisStack, connectMongo, mongoHealthy, redisHealthy } from './container.js';
import { createLogger } from './lib/logger.js';
import { installShutdown } from './lifecycle.js';
import { createAnalysisQueue, makeEnqueue } from './queue/analysisQueue.js';
import { createAnalysisWorker } from './queue/analysisWorker.js';
import { createRedisConnection } from './queue/redis.js';

async function main() {
  const config = loadConfig();
  const logger = createLogger(
    config.logLevel,
    config.env === 'development' && process.stdout.isTTY,
  );
  await connectMongo(config.mongoUri, logger);
  const redis = createRedisConnection(config.redisUrl);
  const queue = createAnalysisQueue(redis);
  const stack = buildAnalysisStack(config, logger);

  const worker = config.queue.runWorkerInApi
    ? createAnalysisWorker(
        createRedisConnection(config.redisUrl),
        stack.processor,
        config.queue,
        logger,
      )
    : null;

  const app = createApp({
    config,
    logger,
    repo: stack.repo,
    enqueue: makeEnqueue(queue, config.queue),
    healthChecks: { mongo: mongoHealthy, redis: redisHealthy(redis) },
  });
  const server = createServer(app);
  server.listen(config.port, () =>
    logger.info({ port: config.port, worker: Boolean(worker) }, 'API listening'),
  );

  installShutdown(logger, [
    { name: 'http', close: () => new Promise((r) => server.close(() => r(undefined))) },
    ...(worker ? [{ name: 'worker', close: () => worker.close() }] : []),
    { name: 'queue', close: () => queue.close() },
    ...(stack.pool ? [{ name: 'browser', close: () => stack.pool!.close() }] : []),
    { name: 'http-dispatchers', close: closeDispatchers },
    { name: 'redis', close: () => redis.quit() },
    { name: 'mongo', close: () => mongoose.disconnect() },
  ]);
}

main().catch((err: unknown) => {
  // Logger may not exist yet (e.g. config error), so fall back to stderr.
  process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
