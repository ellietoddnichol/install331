#!/usr/bin/env tsx
/**
 * Prints the service account private_key as real PEM (newlines fixed).
 * Use when a GCP UI expects PEM only; do NOT commit the output.
 *
 *   npx tsx scripts/extract-service-account-pem.ts path/to/sa.json
 *   npx tsx scripts/extract-service-account-pem.ts path/to/sa.json > sa.pem
 *   npx tsx scripts/extract-service-account-pem.ts --fingerprint path/to/sa.json
 *     (matches Cloud Run logs when GOOGLE_SHEETS_AUTH_DEBUG=1)
 */
import crypto from 'node:crypto';
import fs from 'node:fs';

function normalizePrivateKeyPem(raw: string): string {
  let key = String(raw || '').trim();
  key = key.replace(/[\u200B-\u200D\uFEFF\u00A0]/g, '');
  if (key.charCodeAt(0) === 0xfeff) key = key.slice(1).trim();
  if (
    (key.startsWith('"') && key.endsWith('"')) ||
    (key.startsWith("'") && key.endsWith("'"))
  ) {
    key = key.slice(1, -1).trim();
  }
  for (let i = 0; i < 4; i += 1) {
    const next = key.replace(/\\n/g, '\n');
    if (next === key) break;
    key = next;
  }
  return key.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
}

const args = process.argv.slice(2).filter(Boolean);
const fingerprint = args.includes('--fingerprint');
const positional = args.filter((a) => a !== '--fingerprint');
const file = positional[0];
if (!file) {
  console.error(
    'Usage: npx tsx scripts/extract-service-account-pem.ts [--fingerprint] <service-account.json>'
  );
  process.exit(1);
}

let parsed: { type?: string; private_key?: string; private_key_id?: string; client_email?: string };
try {
  parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as typeof parsed;
} catch (e) {
  console.error('Could not read or parse JSON:', e instanceof Error ? e.message : e);
  process.exit(1);
}

if (parsed.type !== 'service_account') {
  console.error('Expected type "service_account", got:', parsed.type || '(missing)');
  process.exit(1);
}

const pem = normalizePrivateKeyPem(parsed.private_key || '');
if (!/BEGIN (RSA )?PRIVATE KEY/.test(pem) && !/BEGIN EC PRIVATE KEY/.test(pem)) {
  console.error('private_key does not look like PEM after normalization.');
  process.exit(1);
}

if (fingerprint) {
  const fp = crypto.createHash('sha256').update(pem, 'utf8').digest('hex').slice(0, 16);
  const kid = parsed.private_key_id != null ? String(parsed.private_key_id) : '(none)';
  console.log(
    `client_email=${parsed.client_email} private_key_len=${pem.length} private_key_sha256_16=${fp} private_key_id=${kid}`
  );
  process.exit(0);
}

process.stdout.write(`${pem}\n`);
