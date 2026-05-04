import type { Request, Response } from 'express';

export function getCookieValue(req: Request, name: string): string | undefined {
  const header = String(req.headers.cookie || '');
  if (!header) return undefined;
  const parts = header.split(';');
  for (const part of parts) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    if (k !== name) continue;
    let v = part.slice(idx + 1).trim();
    try {
      v = decodeURIComponent(v);
    } catch {
      /* keep */
    }
    return v;
  }
  return undefined;
}

const SECURE_IN_PROD = String(process.env.NODE_ENV || '').toLowerCase() === 'production';

export function setHttpOnlyCookie(res: Response, name: string, value: string, maxAgeSec: number): void {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAgeSec}`,
  ];
  if (SECURE_IN_PROD) parts.push('Secure');
  res.append('Set-Cookie', parts.join('; '));
}

export function clearHttpOnlyCookie(res: Response, name: string): void {
  const parts = [`${name}=`, 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0'];
  if (SECURE_IN_PROD) parts.push('Secure');
  res.append('Set-Cookie', parts.join('; '));
}
