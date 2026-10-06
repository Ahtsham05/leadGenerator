import { createHash, timingSafeEqual } from 'node:crypto';
import type { RequestHandler } from 'express';
import { AppError } from '../lib/errors.js';

const digest = (s: string) => createHash('sha256').update(s).digest();

/** Simple bearer-token auth using the shared admin access token. */
export function requireAdminToken(adminToken: string): RequestHandler {
  const expected = digest(adminToken);
  return (req, _res, next) => {
    const header = req.headers.authorization ?? '';
    const match = /^Bearer\s+(.+)$/i.exec(header);
    // Compare fixed-length digests so timing does not leak token length or content.
    if (!match?.[1] || !timingSafeEqual(digest(match[1].trim()), expected)) {
      return next(new AppError(401, 'UNAUTHORIZED', 'Missing or invalid bearer token'));
    }
    next();
  };
}
