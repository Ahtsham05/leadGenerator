import { ANALYSIS_VERSION, type AnalysisStatus } from '@lead/shared';
import type { Logger } from '../lib/logger.js';
import { randomBetween, sleep } from '../lib/sleep.js';
import type { AnalysisOrchestrator } from '../orchestrator/analysisOrchestrator.js';
import type { LeadRepository } from '../services/leadRepository.js';

export interface ProcessorJob {
  id?: string;
  data: { leadId: string };
  timestamp: number;
  attemptsMade: number;
  opts: { attempts?: number };
}

export interface ProcessorDeps {
  repo: LeadRepository;
  orchestrator: Pick<AnalysisOrchestrator, 'run'>;
  logger: Logger;
  minDelayMs: number;
  maxDelayMs: number;
  jobTimeoutMs: number;
}

export class RetryableJobError extends Error {
  override name = 'RetryableJobError';
}

export interface ProcessorResult {
  skipped?: string;
  status?: AnalysisStatus;
  score?: number | null;
}

/**
 * Job processor, independent of BullMQ for testability.
 * Idempotent: a lead already analysed (current version) after the job was queued is skipped.
 */
export function createAnalysisProcessor(deps: ProcessorDeps) {
  return async function process(job: ProcessorJob): Promise<ProcessorResult> {
    const { leadId } = job.data;
    const log = deps.logger.child({ leadId, jobId: job.id, attempt: job.attemptsMade + 1 });
    const lead = await deps.repo.findById(leadId);
    if (!lead) {
      log.warn('lead not found; dropping job');
      return { skipped: 'lead not found' };
    }
    if (
      lead.analyzedAt &&
      lead.analyzedAt.getTime() >= job.timestamp &&
      lead.analysisVersion === ANALYSIS_VERSION &&
      lead.analysisStatus !== 'analyzing'
    ) {
      log.info('lead already analysed after this job was queued; skipping');
      return { skipped: 'already analysed' };
    }

    // Politeness: spread requests to target sites out over time.
    await sleep(randomBetween(deps.minDelayMs, deps.maxDelayMs));
    await deps.repo.markAnalyzing(leadId);

    const attempts = job.opts.attempts ?? 1;
    const isFinalAttempt = job.attemptsMade + 1 >= attempts;
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(new Error(`Job exceeded ${deps.jobTimeoutMs} ms`)),
      deps.jobTimeoutMs,
    );
    const timeout = new Promise<never>((_, reject) => {
      controller.signal.addEventListener('abort', () => reject(controller.signal.reason as Error), {
        once: true,
      });
    });

    try {
      const outcome = await Promise.race([
        deps.orchestrator.run(lead, { isFinalAttempt, signal: controller.signal }),
        timeout,
      ]);
      if (outcome.kind === 'retry') {
        await deps.repo.setPending(leadId);
        log.info({ reason: outcome.reason }, 'target site rate-limited us; backing off');
        throw new RetryableJobError(outcome.reason);
      }
      await deps.repo.saveAnalysis(leadId, outcome.update);
      log.info(
        {
          status: outcome.update.analysisStatus,
          score: outcome.update.score,
          durations: outcome.update.stageDurations,
        },
        'analysis saved',
      );
      return { status: outcome.update.analysisStatus, score: outcome.update.score };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (isFinalAttempt) {
        const status: AnalysisStatus = err instanceof RetryableJobError ? 'blocked' : 'failed';
        await deps.repo.recordFailure(leadId, status, {
          stage: 'queue',
          message: `Final attempt failed: ${message}`,
          at: new Date(),
        });
        log.error({ err: message, status }, 'analysis failed on final attempt');
      } else if (!(err instanceof RetryableJobError)) {
        await deps.repo.setPending(leadId);
        log.warn({ err: message }, 'analysis attempt failed; will retry');
      }
      throw err;
    } finally {
      clearTimeout(timer);
      controller.abort();
    }
  };
}
