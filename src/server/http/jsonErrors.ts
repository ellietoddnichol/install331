import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';

/** Client-safe message for unexpected failures (no SQL / stack leakage). */
export const GENERIC_SERVER_ERROR = 'An internal server error occurred.';

export function handleRouteError(res: Response, err: unknown, logLabel = '[api]') {
  if (err instanceof ZodError) {
    console.warn(`${logLabel} validation`, err.flatten());
    return res.status(400).json({
      error: 'Validation failed',
      issues: err.flatten(),
    });
  }
  const message = err instanceof Error ? err.message : String(err);
  console.error(`${logLabel}`, message, err);
  return res.status(500).json({ error: GENERIC_SERVER_ERROR });
}

/** Express 4-arg error middleware: log full detail server-side; never echo SQL or internals to clients. */
export function expressErrorHandler(err: unknown, _req: Request, res: Response, next: NextFunction) {
  if (res.headersSent) {
    next(err);
    return;
  }
  if (err instanceof ZodError) {
    console.warn('[express] validation', err.flatten());
    res.status(400).json({ error: 'Validation failed', issues: err.flatten() });
    return;
  }
  const message = err instanceof Error ? err.message : String(err);
  console.error('[express]', message, err);
  res.status(500).json({ error: GENERIC_SERVER_ERROR });
}
