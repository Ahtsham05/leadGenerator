import { performance } from 'node:perf_hooks';
import type { AnalysisError, AnalysisStage, StageDuration } from '@lead/shared';
import type { Logger } from '../lib/logger.js';

/** Runs stages with timing and error isolation: a failing stage records an error and returns null. */
export class StageRunner {
  readonly durations: StageDuration[] = [];
  readonly errors: AnalysisError[] = [];

  constructor(
    private readonly logger: Logger,
    private readonly now: () => Date,
  ) {}

  async run<T>(stage: AnalysisStage, fn: () => Promise<T> | T): Promise<T | null> {
    const start = performance.now();
    try {
      const result = await fn();
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.error(stage, message);
      this.logger.warn({ stage, err: message }, 'analysis stage failed');
      return null;
    } finally {
      const ms = Math.round(performance.now() - start);
      this.durations.push({ stage, ms });
      this.logger.debug({ stage, ms }, 'stage finished');
    }
  }

  error(stage: AnalysisStage, message: string): void {
    this.errors.push({ stage, message: message.slice(0, 500), at: this.now() });
  }
}
