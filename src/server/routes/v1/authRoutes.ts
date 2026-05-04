import { Router } from 'express';
import { getErrorMessage } from '../../../shared/utils/errorMessage.ts';
import {
  clearPasswordSessionCookie,
  isPasswordLoginConfigured,
  issuePasswordSessionCookie,
  readPasswordSessionEmail,
  verifyPasswordLoginAttempt,
} from '../../auth/passwordSession.ts';

export const authRouter = Router();

/**
 * Server-verified session when Supabase is not used: set `AUTH_LOGIN_PASSWORD` and optional `AUTH_SESSION_SECRET`.
 * Client must send `credentials: 'same-origin'` (see `apiFetch`).
 */
authRouter.post('/password-login', (req, res) => {
  try {
    if (!isPasswordLoginConfigured()) {
      return res.status(503).json({ error: 'Password login is not configured (set AUTH_LOGIN_PASSWORD).' });
    }
    const emailRaw = String(req.body?.email ?? '').trim();
    const password = String(req.body?.password ?? '');
    const emailRequired = String(process.env.AUTH_LOGIN_EMAIL || '').trim();
    const email = emailRaw.toLowerCase() || 'user@local';
    if (emailRequired && email !== emailRequired.toLowerCase()) {
      return res.status(401).json({ error: 'Invalid credentials.' });
    }
    if (!verifyPasswordLoginAttempt(password)) {
      return res.status(401).json({ error: 'Invalid credentials.' });
    }
    issuePasswordSessionCookie(res, email);
    return res.json({ data: { ok: true, email } });
  } catch (error: unknown) {
    return res.status(500).json({ error: getErrorMessage(error, 'Login failed.') });
  }
});

authRouter.post('/password-logout', (req, res) => {
  clearPasswordSessionCookie(res);
  return res.json({ data: { ok: true } });
});

authRouter.get('/password-session', (req, res) => {
  const email = readPasswordSessionEmail(req);
  return res.json({ data: { email } });
});
