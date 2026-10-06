import { lookup as dnsLookup } from 'node:dns';
import type { LookupFunction } from 'node:net';
import { Agent, EnvHttpProxyAgent, type Dispatcher } from 'undici';
import { isPrivateIp } from './urlSafety.js';

/**
 * DNS lookup that refuses private addresses at connect time. This closes the
 * DNS-rebinding gap between our pre-flight check and the actual connection.
 */
const guardedLookup: LookupFunction = (hostname, options, callback) => {
  dnsLookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return callback(err, '', 0);
    const list = addresses as unknown as Array<{ address: string; family: number }>;
    const bad = list.find((a) => isPrivateIp(a.address));
    if (bad) {
      return callback(new Error(`Refusing to connect to private address ${bad.address}`), '', 0);
    }
    if (options.all) return (callback as unknown as (e: null, a: typeof list) => void)(null, list);
    const first = list[0];
    if (!first) return callback(new Error(`No addresses for ${hostname}`), '', 0);
    callback(null, first.address, first.family);
  });
};

let targetDispatcher: Dispatcher | undefined;
let apiDispatcher: Dispatcher | undefined;

function proxyConfigured(): boolean {
  return Boolean(
    process.env.HTTPS_PROXY ||
    process.env.https_proxy ||
    process.env.HTTP_PROXY ||
    process.env.http_proxy,
  );
}

/**
 * Dispatcher for requests to target (untrusted) websites.
 * Without a proxy, connect-time DNS is guarded. Behind an egress proxy the proxy
 * resolves names, so we rely on the pre-flight `assertPublicHost` check.
 */
export function getTargetDispatcher(): Dispatcher {
  targetDispatcher ??= proxyConfigured()
    ? new EnvHttpProxyAgent()
    : new Agent({ connect: { lookup: guardedLookup } });
  return targetDispatcher;
}

/** Dispatcher for trusted third-party APIs (Google, Anthropic). Honours proxy env vars. */
export function getApiDispatcher(): Dispatcher {
  apiDispatcher ??= new EnvHttpProxyAgent();
  return apiDispatcher;
}

export async function closeDispatchers(): Promise<void> {
  await Promise.allSettled([targetDispatcher?.close(), apiDispatcher?.close()]);
  targetDispatcher = undefined;
  apiDispatcher = undefined;
}
