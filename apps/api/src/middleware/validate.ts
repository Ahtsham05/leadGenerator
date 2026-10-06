import type { RequestHandler, Response } from 'express';
import type { z } from 'zod';

/**
 * Validated values are stored on res.locals because Express 5 makes req.query read-only.
 */
export function validateBody<S extends z.ZodType>(schema: S): RequestHandler {
  return (req, res, next) => {
    const parsed = schema.safeParse(req.body ?? {});
    if (!parsed.success) return next(parsed.error);
    res.locals.body = parsed.data;
    next();
  };
}

export function validateQuery<S extends z.ZodType>(schema: S): RequestHandler {
  return (req, res, next) => {
    const parsed = schema.safeParse(req.query);
    if (!parsed.success) return next(parsed.error);
    res.locals.query = parsed.data;
    next();
  };
}

export function validateParams<S extends z.ZodType>(schema: S): RequestHandler {
  return (req, res, next) => {
    const parsed = schema.safeParse(req.params);
    if (!parsed.success) return next(parsed.error);
    res.locals.params = parsed.data;
    next();
  };
}

export const bodyOf = <T>(res: Response): T => res.locals.body as T;
export const queryOf = <T>(res: Response): T => res.locals.query as T;
export const paramsOf = <T>(res: Response): T => res.locals.params as T;
