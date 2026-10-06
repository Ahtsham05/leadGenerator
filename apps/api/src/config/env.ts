import { z } from 'zod';

const int = (def: number) => z.coerce.number().int().min(0).default(def);
const bool = (def: boolean) =>
  z
    .enum(['true', 'false', '1', '0'])
    .default(def ? 'true' : 'false')
    .transform((v) => v === 'true' || v === '1');
const optionalSecret = z
  .string()
  .optional()
  .transform((v) => (v && v.trim().length > 0 ? v.trim() : undefined));

const EnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    API_PORT: int(4000),
    WEB_ORIGIN: z.string().default('http://localhost:5173'),

    MONGODB_URI: z.string().min(1, 'MONGODB_URI is required'),
    REDIS_URL: z.string().min(1, 'REDIS_URL is required'),

    ADMIN_ACCESS_TOKEN: z.string().min(16, 'ADMIN_ACCESS_TOKEN must be at least 16 characters'),

    GOOGLE_PLACES_API_KEY: optionalSecret,
    PAGESPEED_API_KEY: optionalSecret,
    ANTHROPIC_API_KEY: optionalSecret,

    ANALYSIS_CONCURRENCY: z.coerce.number().int().min(1).max(20).default(3),
    ANALYSIS_MIN_DELAY_MS: int(2000),
    ANALYSIS_MAX_DELAY_MS: int(5000),
    REQUEST_TIMEOUT_MS: z.coerce.number().int().min(1000).default(20000),
    ANALYSIS_RETRIES: int(2),
    ANALYSIS_JOB_TIMEOUT_MS: z.coerce.number().int().min(10000).default(180000),
    RUN_WORKER_IN_API: bool(true),

    PLACES_DAILY_REQUEST_CAP: int(200),
    PLACES_MONTHLY_REQUEST_CAP: int(3000),

    PAGESPEED_CACHE_DAYS: int(7),
    PAGESPEED_TIMEOUT_MS: z.coerce.number().int().min(5000).default(90000),

    CRAWLER_USER_AGENT: z
      .string()
      .default('LeadIntelBot/0.1 (+https://example.com/bot; contact: you@example.com)'),
    MAX_PAGE_BYTES: z.coerce
      .number()
      .int()
      .min(10000)
      .default(3 * 1024 * 1024),

    UPLOADS_DIR: z.string().default('./uploads'),
    BROWSER_ENABLED: bool(true),
    BROWSER_POOL_SIZE: z.coerce.number().int().min(1).max(10).default(2),
    BROWSER_PAGE_TIMEOUT_MS: z.coerce.number().int().min(5000).default(25000),
    PLAYWRIGHT_EXECUTABLE_PATH: optionalSecret,
  })
  .refine((e) => e.NODE_ENV !== 'production' || !e.ADMIN_ACCESS_TOKEN.startsWith('change-me'), {
    message: 'ADMIN_ACCESS_TOKEN still has the .env.example placeholder value',
    path: ['ADMIN_ACCESS_TOKEN'],
  })
  .refine((e) => e.ANALYSIS_MAX_DELAY_MS >= e.ANALYSIS_MIN_DELAY_MS, {
    message: 'ANALYSIS_MAX_DELAY_MS must be >= ANALYSIS_MIN_DELAY_MS',
    path: ['ANALYSIS_MAX_DELAY_MS'],
  });

export type Env = z.infer<typeof EnvSchema>;

export interface Config {
  env: Env['NODE_ENV'];
  logLevel: Env['LOG_LEVEL'];
  port: number;
  webOrigin: string[];
  mongoUri: string;
  redisUrl: string;
  adminToken: string;
  keys: { places?: string; pageSpeed?: string; anthropic?: string };
  queue: {
    concurrency: number;
    minDelayMs: number;
    maxDelayMs: number;
    retries: number;
    jobTimeoutMs: number;
    runWorkerInApi: boolean;
  };
  http: { timeoutMs: number; userAgent: string; maxBytes: number };
  budget: { placesDailyCap: number; placesMonthlyCap: number };
  pageSpeed: { cacheDays: number; timeoutMs: number };
  browser: {
    enabled: boolean;
    poolSize: number;
    pageTimeoutMs: number;
    executablePath?: string;
    uploadsDir: string;
  };
}

export class ConfigError extends Error {
  override name = 'ConfigError';
}

export function loadConfig(source: NodeJS.ProcessEnv = process.env): Config {
  const parsed = EnvSchema.safeParse(source);
  if (!parsed.success) {
    const lines = parsed.error.issues.map(
      (i) => `  - ${i.path.join('.') || '(env)'}: ${i.message}`,
    );
    throw new ConfigError(`Invalid environment configuration:\n${lines.join('\n')}`);
  }
  const e = parsed.data;
  return {
    env: e.NODE_ENV,
    logLevel: e.LOG_LEVEL,
    port: e.API_PORT,
    webOrigin: e.WEB_ORIGIN.split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    mongoUri: e.MONGODB_URI,
    redisUrl: e.REDIS_URL,
    adminToken: e.ADMIN_ACCESS_TOKEN,
    keys: {
      places: e.GOOGLE_PLACES_API_KEY,
      pageSpeed: e.PAGESPEED_API_KEY,
      anthropic: e.ANTHROPIC_API_KEY,
    },
    queue: {
      concurrency: e.ANALYSIS_CONCURRENCY,
      minDelayMs: e.ANALYSIS_MIN_DELAY_MS,
      maxDelayMs: e.ANALYSIS_MAX_DELAY_MS,
      retries: e.ANALYSIS_RETRIES,
      jobTimeoutMs: e.ANALYSIS_JOB_TIMEOUT_MS,
      runWorkerInApi: e.RUN_WORKER_IN_API,
    },
    http: {
      timeoutMs: e.REQUEST_TIMEOUT_MS,
      userAgent: e.CRAWLER_USER_AGENT,
      maxBytes: e.MAX_PAGE_BYTES,
    },
    budget: {
      placesDailyCap: e.PLACES_DAILY_REQUEST_CAP,
      placesMonthlyCap: e.PLACES_MONTHLY_REQUEST_CAP,
    },
    pageSpeed: { cacheDays: e.PAGESPEED_CACHE_DAYS, timeoutMs: e.PAGESPEED_TIMEOUT_MS },
    browser: {
      enabled: e.BROWSER_ENABLED,
      poolSize: e.BROWSER_POOL_SIZE,
      pageTimeoutMs: e.BROWSER_PAGE_TIMEOUT_MS,
      executablePath: e.PLAYWRIGHT_EXECUTABLE_PATH,
      uploadsDir: e.UPLOADS_DIR,
    },
  };
}
