import { describe, expect, it, vi } from 'vitest';
import { ANALYSIS_VERSION } from '@lead/shared';
import { MemoryLeadRepository, makeLead } from '../../test/helpers/memoryRepo.js';
import { silentLogger } from '../../test/helpers/silentLogger.js';
import type {
  AnalysisOrchestrator,
  OrchestratorOutcome,
} from '../orchestrator/analysisOrchestrator.js';
import type { LeadAnalysisUpdate } from '../services/leadRepository.js';
import { createAnalysisProcessor, RetryableJobError } from './analysisProcessor.js';

function setup(run: () => Promise<OrchestratorOutcome>, jobTimeoutMs = 2000) {
  const repo = new MemoryLeadRepository();
  const lead = makeLead({ website: 'https://a.example/' });
  repo.leads.set(lead.id, lead);
  const orchestrator = { run: vi.fn<AnalysisOrchestrator['run']>(run) };
  const process = createAnalysisProcessor({
    repo,
    orchestrator,
    logger: silentLogger,
    minDelayMs: 0,
    maxDelayMs: 0,
    jobTimeoutMs,
  });
  const job = (attemptsMade = 0) => ({
    id: 'j',
    data: { leadId: lead.id },
    timestamp: Date.now(),
    attemptsMade,
    opts: { attempts: 3 },
  });
  return { repo, lead, orchestrator, process, job };
}

const update = {
  analysisStatus: 'completed',
  score: 77,
  stageDurations: [],
  analysisVersion: ANALYSIS_VERSION,
  analyzedAt: new Date(),
} as unknown as LeadAnalysisUpdate;

describe('analysis processor', () => {
  it('marks analyzing then saves the result', async () => {
    const s = setup(async () => ({ kind: 'done', update }));
    expect(await s.process(s.job())).toEqual({ status: 'completed', score: 77 });
    expect(s.repo.statusLog.map(([, st]) => st)).toEqual(['analyzing', 'completed']);
  });

  it('is idempotent: skips leads analysed after the job was queued', async () => {
    const s = setup(async () => ({ kind: 'done', update }));
    const job = s.job();
    Object.assign(s.lead, {
      analyzedAt: new Date(job.timestamp + 1000),
      analysisVersion: ANALYSIS_VERSION,
      analysisStatus: 'completed',
    });
    expect(await s.process(job)).toEqual({ skipped: 'already analysed' });
    expect(s.orchestrator.run).not.toHaveBeenCalled();
  });

  it('drops jobs for deleted leads', async () => {
    const s = setup(async () => ({ kind: 'done', update }));
    s.repo.leads.clear();
    expect(await s.process(s.job())).toEqual({ skipped: 'lead not found' });
  });

  it('rate-limited target: throws to trigger backoff, marks blocked on final attempt', async () => {
    const s = setup(async () => ({ kind: 'retry', reason: 'Site responded 429' }));
    await expect(s.process(s.job(0))).rejects.toBeInstanceOf(RetryableJobError);
    expect(s.lead.analysisStatus).toBe('pending');
    await expect(s.process(s.job(2))).rejects.toBeInstanceOf(RetryableJobError);
    expect(s.lead.analysisStatus).toBe('blocked');
    expect(s.lead.analysisErrors.at(-1)?.message).toMatch(/429/);
  });

  it('passes isFinalAttempt to the orchestrator', async () => {
    const s = setup(async () => ({ kind: 'done', update }));
    await s.process(s.job(2));
    expect(s.orchestrator.run.mock.calls[0]?.[1]).toMatchObject({ isFinalAttempt: true });
  });

  it('enforces the per-job timeout and records failure on the last attempt', async () => {
    const s = setup(() => new Promise(() => undefined), 50);
    await expect(s.process(s.job(2))).rejects.toThrow(/exceeded 50 ms/);
    expect(s.lead.analysisStatus).toBe('failed');
  });

  it('unexpected errors on non-final attempts reset to pending', async () => {
    const s = setup(async () => {
      throw new Error('boom');
    });
    await expect(s.process(s.job(0))).rejects.toThrow('boom');
    expect(s.lead.analysisStatus).toBe('pending');
  });
});
