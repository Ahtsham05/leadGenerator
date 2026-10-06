import { Worker } from 'bullmq';
import type { Redis } from 'ioredis';
import type { Logger } from '../lib/logger.js';
import { ANALYSIS_QUEUE, type AnalysisJobData } from './analysisQueue.js';
import type { ProcessorResult, createAnalysisProcessor } from './analysisProcessor.js';

export interface WorkerSettings {
  concurrency: number;
  minDelayMs: number;
}

export function createAnalysisWorker(
  connection: Redis,
  processor: ReturnType<typeof createAnalysisProcessor>,
  settings: WorkerSettings,
  logger: Logger,
): Worker<AnalysisJobData, ProcessorResult> {
  const worker = new Worker<AnalysisJobData, ProcessorResult>(
    ANALYSIS_QUEUE,
    (job) => processor(job),
    {
      connection,
      concurrency: settings.concurrency,
      // Global pacing: at most one job starts per minDelay window, across all workers.
      limiter: { max: 1, duration: Math.max(settings.minDelayMs, 1) },
      stalledInterval: 30_000,
      maxStalledCount: 1,
    },
  );
  worker.on('stalled', (jobId) =>
    logger.warn({ jobId }, 'analysis job stalled; it will be retried'),
  );
  worker.on('failed', (job, err) =>
    logger.warn(
      {
        jobId: job?.id,
        leadId: job?.data.leadId,
        attemptsMade: job?.attemptsMade,
        err: err.message,
      },
      'analysis job failed',
    ),
  );
  worker.on('error', (err) => logger.error({ err }, 'worker error'));
  return worker;
}
