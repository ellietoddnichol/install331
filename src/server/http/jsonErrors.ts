import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';

/** Client-safe message for unexpected failures (no SQL / stack leakage). */
export const GENERIC_SERVER_ERROR = 'An internal server error occurred.';

/** HTTP status from Gaxios / googleapis errors (for route mapping without importing gaxios types). */
export function getGaxiosLikeHttpStatus(err: unknown): number | undefined {
  if (!err || typeof err !== 'object') return undefined;
  const o = err as Record<string, unknown>;
  if (typeof o.code === 'number') return o.code;
  if (typeof o.code === 'string' && /^\d{3}$/.test(o.code)) return Number(o.code);
  if (typeof o.status === 'number') return o.status;
  const response = o.response;
  if (response && typeof response === 'object') {
    const r = response as Record<string, unknown>;
    if (typeof r.status === 'number') return r.status;
  }
  const cause = o.cause;
  if (cause && typeof cause === 'object') {
    const c = cause as Record<string, unknown>;
    if (typeof c.code === 'number') return c.code;
    if (c.status === 'PERMISSION_DENIED') return 403;
    if (c.status === 'NOT_FOUND') return 404;
  }
  const message = err instanceof Error ? err.message : String(err);
  if (/permission denied|forbidden/i.test(message)) return 403;
  if (/not found|requested entity was not found/i.test(message)) return 404;
  return undefined;
}

/**
 * Maps Google Sheets API permission errors to a JSON response so async route handlers do not crash the process.
 * @returns true if a response was sent
 */
export function tryRespondSheetsPermissionDenied(res: Response, err: unknown, logLabel = '[api]'): boolean {
  if (getGaxiosLikeHttpStatus(err) !== 403) return false;
  const message = err instanceof Error ? err.message : String(err);
  console.error(`${logLabel} google sheets permission denied`, message);
  res.status(503).json({
    error: 'Google Sheets returned permission denied for this workbook.',
    hint: 'Share the spreadsheet with GOOGLE_SERVICE_ACCOUNT_EMAIL (Viewer is enough for read-only catalog routes). Confirm CATALOG_LABOR_BACKEND_SPREADSHEET_ID points at the intended file. For legacy monolithic workbooks, set GOOGLE_SHEETS_TAB_CATALOG_ITEMS=CATALOG_ITEMS if the tab is not named CatalogItems.',
  });
  return true;
}

/**
 * Spreadsheet or range missing (wrong file id, trashed file, or tab name does not match).
 * @returns true if a response was sent
 */
export function tryRespondSheetsNotFound(res: Response, err: unknown, logLabel = '[api]'): boolean {
  if (getGaxiosLikeHttpStatus(err) !== 404) return false;
  const message = err instanceof Error ? err.message : String(err);
  console.error(`${logLabel} google sheets not found`, message);
  res.status(503).json({
    error: 'Google Sheets returned not found for this request.',
    hint: 'Confirm CATALOG_LABOR_BACKEND_SPREADSHEET_ID matches the file URL (watch for typos: capital I vs lowercase l in the id). Ensure the catalog items tab exists: Div 10 default is CatalogItems; legacy workbooks often use CATALOG_ITEMS — set GOOGLE_SHEETS_TAB_CATALOG_ITEMS to the exact tab name.',
  });
  return true;
}

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
