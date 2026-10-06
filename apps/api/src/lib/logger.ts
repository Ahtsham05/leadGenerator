import { pino, type Logger } from 'pino';

export type { Logger };

/** Paths that must never reach the logs. */
const REDACT = [
  'req.headers.authorization',
  'req.headers.cookie',
  'headers.authorization',
  'authorization',
  '*.apiKey',
  '*.key',
  '*.token',
  'config.adminToken',
  'config.keys',
];

export function createLogger(level: string, pretty = false): Logger {
  return pino({
    level,
    redact: { paths: REDACT, censor: '[redacted]' },
    base: { service: 'lead-api' },
    ...(pretty ? { transport: { target: 'pino-pretty', options: { colorize: true } } } : {}),
  });
}

/** Strip query strings (which may carry API keys) from URLs before logging. */
export function safeUrlForLog(url: string): string {
  try {
    const u = new URL(url);
    u.search = '';
    return u.toString();
  } catch {
    return '[invalid-url]';
  }
}
