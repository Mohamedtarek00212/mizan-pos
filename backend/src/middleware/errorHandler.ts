import { NextFunction, Request, Response } from 'express';
import { AppError } from '../common/errors';
import { logger } from '../config/logger';

/**
 * Centralized error-handling middleware (Step 5 A9).
 * Must be registered LAST, after all routes.
 */
export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction,
): void {
  if (err instanceof AppError) {
    logger.warn({ errorCode: err.errorCode, path: req.path, details: err.details }, err.message);
    res.status(err.statusCode).json({
      error_code: err.errorCode,
      message: err.message,
      details: err.details ?? null,
    });
    return;
  }

  if (
    typeof err === 'object' &&
    err !== null &&
    'type' in err &&
    err.type === 'entity.too.large'
  ) {
    res.status(413).json({
      error_code: 'PAYLOAD_TOO_LARGE',
      message: 'Request body is too large',
      details: null,
    });
    return;
  }

  logger.error({ err, path: req.path }, 'Unhandled error');
  res.status(500).json({
    error_code: 'INTERNAL_ERROR',
    message: 'An unexpected error occurred',
    details: null,
  });
}

/**
 * 404 fallback for unmatched routes. Registered after all routes, before
 * the error handler.
 */
export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    error_code: 'NOT_FOUND',
    message: `No route matches ${req.method} ${req.path}`,
    details: null,
  });
}
