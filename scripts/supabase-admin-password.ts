/**
 * Escape hatch when dashboard password reset email/open-link fails (SMTP, redirect URLs, etc.).
 *
 * Requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (never commit the service role key).
 *
 *   recovery-link <email>
 *       Prints a one-time recovery URL — paste into your browser; completes reset against Site URL.
 *
 *   set-password <email> <newPassword>
 *       Sets password directly (confirm production intent before running).
 *
 *   confirm-email <email>
 *       Marks email as confirmed (if signup confirmation blocked login).
 *
 * PowerShell (use single quotes around the JWT so characters like $ are not expanded):
 *   cd c:\\Users\\you\\311
 *   $env:SUPABASE_URL='https://xxxxx.supabase.co'
 *   $env:SUPABASE_SERVICE_ROLE_KEY='eyJhbGciOi...'   # from Dashboard → Settings → API → service_role (secret)
 *   npm run supabase:admin-password -- recovery-link user@company.com
 *
 * Do not paste the literal text "<paste ...>" — copy the full JWT key from the dashboard (Reveal).
 *
 * Or put SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env.local (gitignored) — this script loads it automatically.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

const __scriptDir = path.dirname(fileURLToPath(import.meta.url));
const __repoRoot = path.join(__scriptDir, '..');

function loadRepoEnv(): void {
  const envPath = path.join(__repoRoot, '.env');
  const localPath = path.join(__repoRoot, '.env.local');
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
  }
  if (fs.existsSync(localPath)) {
    dotenv.config({ path: localPath, override: true });
  }
}

loadRepoEnv();

function sanitizeEnvKey(raw: string): string {
  let s = raw.trim();
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    s = s.slice(1, -1).trim();
  }
  return s;
}

function jwtPayloadRole(key: string): string | null {
  const parts = key.split('.');
  if (parts.length !== 3) return null;
  try {
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
    const json = Buffer.from(padded, 'base64').toString('utf8');
    const payload = JSON.parse(json) as { role?: string };
    return typeof payload.role === 'string' ? payload.role : null;
  } catch {
    return null;
  }
}

function jwtPayloadRef(key: string): string | null {
  const parts = key.split('.');
  if (parts.length !== 3) return null;
  try {
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
    const json = Buffer.from(padded, 'base64').toString('utf8');
    const payload = JSON.parse(json) as { ref?: string };
    return typeof payload.ref === 'string' ? payload.ref.trim() : null;
  } catch {
    return null;
  }
}

function assertUrlMatchesProjectRef(urlStr: string, serviceKeyForJwt: string): void {
  const ref = jwtPayloadRef(serviceKeyForJwt);
  if (!ref || !urlStr) return;
  const host = urlStr.replace(/^https?:\/\//i, '').split('/')[0]?.split(':')[0] ?? '';
  if (!host.includes(ref)) {
    console.error(
      [
        `SUPABASE_URL host "${host}" does not match JWT project ref "${ref}".`,
        `Expected host like: ${ref}.supabase.co`,
        '',
        'Use the service_role key from the SAME project as SUPABASE_URL.',
      ].join('\n'),
    );
    process.exit(1);
  }
}

function explainInvalidApiKey(): void {
  console.error(
    [
      '',
      'Supabase returned "Invalid API key". Common fixes:',
      '  1. Put SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local (this script loads it), OR',
      '     set $env:... in this SAME PowerShell window immediately before npm run.',
      '  2. Regenerate service_role in Dashboard → Settings → API if you rotated keys.',
      '  3. URL + JWT must be from one project (script verifies JWT ref vs SUPABASE_URL host).',
    ].join('\n'),
  );
}

function assertServiceRoleKey(serviceKey: string): void {
  const lower = serviceKey.toLowerCase();
  if (
    serviceKey.length < 80 ||
    lower.includes('<paste') ||
    lower.includes('paste service') ||
    lower.includes('your_service') ||
    lower.includes('replace_me')
  ) {
    console.error(
      [
        'SUPABASE_SERVICE_ROLE_KEY does not look like a real JWT from the dashboard.',
        '',
        'Fix:',
        '  1. Supabase → Project Settings → API → copy "service_role" secret (Reveal).',
        '  2. PowerShell: $env:SUPABASE_SERVICE_ROLE_KEY=\'eyJhbGciOi...\'  (single quotes — not double quotes if your JWT contains $).',
        '  3. Do not paste angle brackets or the words "paste service_role" — paste only the key.',
      ].join('\n'),
    );
    process.exit(1);
  }

  const role = jwtPayloadRole(serviceKey);
  if (role !== 'service_role') {
    console.error(
      role === 'anon'
        ? 'This JWT has role "anon". Admin APIs need the service_role key from Settings → API (not the anon/public key).'
        : `This JWT role is "${role ?? 'unknown'}". Admin APIs require role "service_role".`,
    );
    process.exit(1);
  }
}

const url = String(process.env.SUPABASE_URL || '').trim();
const serviceKey = sanitizeEnvKey(String(process.env.SUPABASE_SERVICE_ROLE_KEY || ''));

async function findUserIdByEmail(adminEmail: string): Promise<string | null> {
  const target = adminEmail.trim().toLowerCase();
  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let page = 1;
  const perPage = 1000;
  for (;;) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) {
      if (String(error.message || '').toLowerCase().includes('invalid api key')) {
        console.error(error.message);
        explainInvalidApiKey();
      }
      throw error;
    }
    const users = data.users;
    const hit = users.find((u) => u.email?.toLowerCase() === target);
    if (hit) return hit.id;
    if (users.length < perPage) return null;
    page += 1;
  }
}

async function main(): Promise<void> {
  const [, , cmd, email, ...rest] = process.argv;
  if (!url || !serviceKey) {
    console.error(
      [
        'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.',
        '',
        'Add both to .env.local in the repo root (recommended), or set:',
        '  $env:SUPABASE_URL=\'https://YOUR_REF.supabase.co\'',
        '  $env:SUPABASE_SERVICE_ROLE_KEY=\'eyJ...\'',
      ].join('\n'),
    );
    process.exit(1);
  }
  assertServiceRoleKey(serviceKey);
  assertUrlMatchesProjectRef(url, serviceKey);
  if (!email?.trim()) {
    console.error(
      'Usage:\n  tsx scripts/supabase-admin-password.ts recovery-link <email>\n  tsx scripts/supabase-admin-password.ts set-password <email> <password>\n  tsx scripts/supabase-admin-password.ts confirm-email <email>',
    );
    process.exit(1);
  }

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  if (cmd === 'recovery-link') {
    const { data, error } = await supabase.auth.admin.generateLink({
      type: 'recovery',
      email: email.trim(),
    });
    if (error) {
      if (String(error.message || '').toLowerCase().includes('invalid api key')) {
        console.error(error.message);
        explainInvalidApiKey();
      }
      console.error(error.message);
      process.exit(1);
    }
    const link = data?.properties?.action_link;
    if (!link) {
      console.error('No action_link in response. Check Supabase project and email.');
      process.exit(1);
    }
    console.log(link);
    console.error('\n(Open this URL in a browser. Ensure Authentication → URL Configuration allows your app origin.)');
    return;
  }

  if (cmd === 'set-password') {
    const password = rest.join(' ').trim();
    if (!password) {
      console.error('Usage: tsx scripts/supabase-admin-password.ts set-password <email> <password>');
      process.exit(1);
    }
    const id = await findUserIdByEmail(email);
    if (!id) {
      console.error(`No user found with email: ${email}`);
      process.exit(1);
    }
    const { error } = await supabase.auth.admin.updateUserById(id, { password });
    if (error) {
      if (String(error.message || '').toLowerCase().includes('invalid api key')) {
        console.error(error.message);
        explainInvalidApiKey();
      }
      console.error(error.message);
      process.exit(1);
    }
    console.error(`Password updated for ${email} (${id}).`);
    return;
  }

  if (cmd === 'confirm-email') {
    const id = await findUserIdByEmail(email);
    if (!id) {
      console.error(`No user found with email: ${email}`);
      process.exit(1);
    }
    const { error } = await supabase.auth.admin.updateUserById(id, {
      email_confirm: true,
    } as { email_confirm?: boolean });
    if (error) {
      if (String(error.message || '').toLowerCase().includes('invalid api key')) {
        console.error(error.message);
        explainInvalidApiKey();
      }
      console.error(error.message);
      process.exit(1);
    }
    console.error(`Marked email confirmed for ${email} (${id}).`);
    return;
  }

  console.error(`Unknown command: ${cmd ?? '(missing)'}`);
  process.exit(1);
}

void main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
