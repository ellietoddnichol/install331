import crypto from 'crypto';
import { getCookieValue, setHttpOnlyCookie, clearHttpOnlyCookie } from '../http/cookieHelpers.ts';
import type { Request, Response } from 'express';

const COOKIE_NAME = 'brighten_pw_session';
const MAX_AGE_SEC = 7 * 24 * 60 * 60;

function sessionSecret(): string {
  return String(process.env.AUTH_SESSION_SECRET || process.env.SUPABASE_JWT_SECRET || 'dev-unsafe-password-session').trim();
}

function signPayload(payload: string): string {
  return crypto.createHmac('sha256', sessionSecret()).update(payload).digest('base64url');
}

export function issuePasswordSessionCookie(res: Response, email: string): void {
  const normalized = String(email || '').trim().toLowerCase();
  const exp = Date.now() + MAX_AGE_SEC * 1000;
  const body = JSON.stringify({ email: normalized, exp });
  const payload = Buffer.from(body, 'utf8').toString('base64url');
  const sig = signPayload(payload);
  setHttpOnlyCookie(res, COOKIE_NAME, `${payload}.${sig}`, MAX_AGE_SEC);
}

export function clearPasswordSessionCookie(res: Response): void {
  clearHttpOnlyCookie(res, COOKIE_NAME);
}

/**
 * Returns signed-in email from password session cookie, or null if missing/invalid/expired.
 */
export function readPasswordSessionEmail(req: Request): string | null {
  const raw = getCookieValue(req, COOKIE_NAME);
  if (!raw || !raw.includes('.')) return null;
  const idx = raw.indexOf('.');
  const payload = raw.slice(0, idx);
  const sig = raw.slice(idx + 1);
  if (signPayload(payload) !== sig) return null;
  let parsed: { email?: string; exp?: number };
  try {
    const json = Buffer.from(payload, 'base64url').toString('utf8');
    parsed = JSON.parse(json) as { email?: string; exp?: number };
  } catch {
    return null;
  }
  if (!parsed.email || typeof parsed.exp !== 'number') return null;
  if (Date.now() > parsed.exp) return null;
  return String(parsed.email).toLowerCase();
}

export function isPasswordLoginConfigured(): boolean {
  return Boolean(String(process.env.AUTH_LOGIN_PASSWORD || '').trim());
}

export function verifyPasswordLoginAttempt(password: string): boolean {
  const expected = process.env.AUTH_LOGIN_PASSWORD;
  if (!expected || !password) return false;
  const a = Buffer.from(String(password), 'utf8');
  const b = Buffer.from(String(expected), 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export { COOKIE_NAME as PASSWORD_SESSION_COOKIE_NAME };
