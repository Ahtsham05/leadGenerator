import mongoose from 'mongoose';
import { closeDispatchers } from './analyzers/net/httpDispatcher.js';
import { loadConfig } from './config/env.js';
import { buildAnalysisStack, connectMongo } from './container.js';
import { createLogger } from './lib/logger.js';
import { installShutdown } from './lifecycle.js';
import { createAnalysisWorker } from './queue/analysisWorker.js';
import { createRedisConnection } from './queue/redis.js';

/** Standalone worker process (use with RUN_WORKER_IN_API=false to scale workers separately). */
async function main() {
  const config = loadConfig();
  const logger = createLogger(
    config.logLevel,
    config.env === 'development' && process.stdout.isTTY,
  );
  await connectMongo(config.mongoUri, logger);
  const redis = createRedisConnection(config.redisUrl);
  const stack = buildAnalysisStack(config, logger);
  const worker = createAnalysisWorker(redis, stack.processor, config.queue, logger);
  logger.info({ concurrency: config.queue.concurrency }, 'analysis worker started');
  installShutdown(logger, [
    { name: 'worker', close: () => worker.close() },
    ...(stack.pool ? [{ name: 'browser', close: () => stack.pool!.close() }] : []),
    { name: 'http-dispatchers', close: closeDispatchers },
    { name: 'redis', close: () => redis.quit() },
    { name: 'mongo', close: () => mongoose.disconnect() },
  ]);
}

main().catch((err: unknown) => {
  process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
