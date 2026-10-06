import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

export type Handler = (req: IncomingMessage, res: ServerResponse) => void;

/** Tiny local HTTP server for fetchPage / Playwright tests. */
export async function startServer(
  routes: Record<string, Handler>,
): Promise<{ url: string; close: () => Promise<void>; hits: string[] }> {
  const hits: string[] = [];
  const server = createServer((req, res) => {
    const path = (req.url ?? '/').split('?')[0] ?? '/';
    hits.push(path);
    const handler = routes[path] ?? routes['*'];
    if (!handler) {
      res.statusCode = 404;
      res.end('not found');
      return;
    }
    handler(req, res);
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    hits,
    close: () => new Promise((r) => server.close(() => r())),
  };
}

export const html =
  (body: string, status = 200, headers: Record<string, string> = {}): Handler =>
  (_req, res) => {
    res.writeHead(status, { 'content-type': 'text/html; charset=utf-8', ...headers });
    res.end(body);
  };

export const text =
  (body: string, status = 200): Handler =>
  (_req, res) => {
    res.writeHead(status, { 'content-type': 'text/plain' });
    res.end(body);
  };

export const redirect =
  (to: string, status = 301): Handler =>
  (_req, res) => {
    res.writeHead(status, { location: to });
    res.end();
  };

export const allowAll = async () => undefined;
