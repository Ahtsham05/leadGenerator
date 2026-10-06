import { Queue, type JobsOptions } from 'bullmq';
import type { Redis } from 'ioredis';

export const ANALYSIS_QUEUE = 'analysis';

export interface AnalysisJobData {
  leadId: string;
  requestedAt: string;
}

export interface QueueSettings {
  retries: number;
}

export function createAnalysisQueue(connection: Redis): Queue<AnalysisJobData> {
  return new Queue<AnalysisJobData>(ANALYSIS_QUEUE, { connection });
}

export function analysisJobOptions(settings: QueueSettings, leadId: string): JobsOptions {
  return {
    attempts: settings.retries + 1,
    // 10s, 20s, 40s... gives rate-limited sites time to recover.
    backoff: { type: 'exponential', delay: 10_000 },
    // While a job for this lead is waiting or active, re-adding returns the existing job.
    deduplication: { id: `lead:${leadId}` },
    removeOnComplete: { age: 24 * 3600, count: 2000 },
    removeOnFail: { age: 7 * 24 * 3600 },
  };
}

export type Enqueue = (leadId: string) => Promise<{ jobId: string | null }>;

export function makeEnqueue(queue: Queue<AnalysisJobData>, settings: QueueSettings): Enqueue {
  return async (leadId) => {
    const job = await queue.add(
      'analyze',
      { leadId, requestedAt: new Date().toISOString() },
      analysisJobOptions(settings, leadId),
    );
    return { jobId: job.id ?? null };
  };
}
