import type { Logger } from './lib/logger.js';

type Closer = { name: string; close: () => Promise<unknown> };

/** Graceful shutdown: close in order, each with a timeout, then exit. */
export function installShutdown(logger: Logger, closers: Closer[], timeoutMs = 25_000): void {
  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, 'shutting down');
    const hardExit = setTimeout(() => {
      logger.error('shutdown timed out; forcing exit');
      process.exit(1);
    }, timeoutMs);
    hardExit.unref();
    for (const c of closers) {
      try {
        await c.close();
        logger.info({ component: c.name }, 'closed');
      } catch (err) {
        logger.error({ err, component: c.name }, 'error while closing');
      }
    }
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('unhandledRejection', (err) => logger.error({ err }, 'unhandled rejection'));
}
