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
 * Examples (PowerShell, repo root):
 *   $env:SUPABASE_URL="https://xxxxx.supabase.co"
 *   $env:SUPABASE_SERVICE_ROLE_KEY="(paste service_role secret)"
 *   npx tsx scripts/supabase-admin-password.ts recovery-link ellie@company.com
 *   npx tsx scripts/supabase-admin-password.ts set-password ellie@company.com 'YourNewStrongPass!'
 */
import { createClient } from '@supabase/supabase-js';

const url = String(process.env.SUPABASE_URL || '').trim();
const serviceKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

async function findUserIdByEmail(adminEmail: string): Promise<string | null> {
  const target = adminEmail.trim().toLowerCase();
  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let page = 1;
  const perPage = 1000;
  for (;;) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
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
    console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment.');
    process.exit(1);
  }
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
