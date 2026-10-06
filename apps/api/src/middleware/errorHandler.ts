import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import type { ApiErrorBody } from '@lead/shared';
import { AppError } from '../lib/errors.js';
import type { Logger } from '../lib/logger.js';

export const notFoundHandler: RequestHandler = (req, res) => {
  const body: ApiErrorBody = {
    error: { code: 'NOT_FOUND', message: `No route for ${req.method} ${req.path}` },
  };
  res.status(404).json(body);
};

export function errorHandler(logger: Logger): ErrorRequestHandler {
  return (err: unknown, req, res, _next) => {
    let status = 500;
    let body: ApiErrorBody = { error: { code: 'INTERNAL', message: 'Internal server error' } };

    if (err instanceof ZodError) {
      status = 400;
      body = {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Request validation failed',
          details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
        },
      };
    } else if (err instanceof AppError) {
      status = err.status;
      body = {
        error: {
          code: err.code,
          message: err.message,
          ...(err.details !== undefined ? { details: err.details } : {}),
        },
      };
    } else if (isHttpError(err) && err.status < 500) {
      status = err.status;
      const message =
        err.type === 'entity.too.large'
          ? 'Request body too large'
          : err.type === 'entity.parse.failed'
            ? 'Malformed request body'
            : status === 404
              ? 'Not found'
              : 'Bad request';
      body = { error: { code: status === 404 ? 'NOT_FOUND' : 'BAD_REQUEST', message } };
    }

    if (status >= 500) logger.error({ err, path: req.path }, 'request failed');
    else logger.debug({ code: body.error.code, path: req.path }, 'request rejected');
    res.status(status).json(body);
  };
}

/** Errors from body-parser / serve-static (http-errors) carry a numeric status. */
function isHttpError(err: unknown): err is { status: number; type?: string } {
  return (
    typeof err === 'object' &&
    err !== null &&
    typeof (err as { status?: unknown }).status === 'number'
  );
}
