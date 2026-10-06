import {
  chromium,
  type Browser,
  type BrowserContext,
  type BrowserContextOptions,
} from 'playwright';
import type { Logger } from '../../lib/logger.js';

export interface BrowserPoolOptions {
  size: number;
  executablePath?: string;
  logger: Logger;
  /** Route browser traffic through HTTPS_PROXY/NO_PROXY when set (default true). */
  useEnvProxy?: boolean;
}

/** Converts proxy env vars into Playwright's proxy option (needed only behind an egress proxy). */
function proxyFromEnv(): { server: string; bypass?: string } | undefined {
  const server =
    process.env.HTTPS_PROXY ||
    process.env.https_proxy ||
    process.env.HTTP_PROXY ||
    process.env.http_proxy;
  if (!server) return undefined;
  const bypass = process.env.NO_PROXY || process.env.no_proxy;
  return { server, ...(bypass ? { bypass } : {}) };
}

/**
 * One shared Chromium instance with a bounded number of concurrent contexts.
 * Each job gets a fresh context which is always closed afterwards.
 */
export class BrowserPool {
  private browser: Browser | null = null;
  private launching: Promise<Browser> | null = null;
  private active = 0;
  private waiters: Array<() => void> = [];
  private closed = false;

  constructor(private readonly opts: BrowserPoolOptions) {}

  private async getBrowser(): Promise<Browser> {
    if (this.browser?.isConnected()) return this.browser;
    this.launching ??= chromium
      .launch({
        headless: true,
        ...(this.opts.executablePath ? { executablePath: this.opts.executablePath } : {}),
        proxy: this.opts.useEnvProxy === false ? undefined : proxyFromEnv(),
        args: ['--disable-dev-shm-usage', '--no-first-run', '--disable-extensions'],
      })
      .then((b) => {
        this.browser = b;
        b.on('disconnected', () => {
          this.opts.logger.warn('browser disconnected; will relaunch on next job');
          this.browser = null;
        });
        return b;
      })
      .finally(() => {
        this.launching = null;
      });
    return this.launching;
  }

  private async acquire(): Promise<void> {
    if (this.active < this.opts.size) {
      this.active++;
      return;
    }
    await new Promise<void>((resolve) => this.waiters.push(resolve));
    this.active++;
  }

  private release(): void {
    this.active--;
    this.waiters.shift()?.();
  }

  async withContext<T>(
    options: BrowserContextOptions,
    fn: (ctx: BrowserContext) => Promise<T>,
  ): Promise<T> {
    if (this.closed) throw new Error('Browser pool is closed');
    await this.acquire();
    let context: BrowserContext | null = null;
    try {
      const browser = await this.getBrowser();
      context = await browser.newContext(options);
      return await fn(context);
    } finally {
      await context?.close().catch(() => undefined);
      this.release();
    }
  }

  async close(): Promise<void> {
    this.closed = true;
    await this.launching?.catch(() => undefined);
    await this.browser?.close().catch(() => undefined);
    this.browser = null;
  }
}
