#!/usr/bin/env node
/**
 * Prints the service account private_key as real PEM (newlines fixed).
 * Use when a GCP UI expects PEM only; do NOT commit the output.
 *
 *   node scripts/extract-service-account-pem.mjs path/to/sa.json
 *   node scripts/extract-service-account-pem.mjs path/to/sa.json > sa.pem
 */
import fs from 'fs';

function normalizePrivateKeyPem(raw) {
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

const file = process.argv[2];
if (!file) {
  console.error('Usage: node scripts/extract-service-account-pem.mjs <service-account.json>');
  process.exit(1);
}

let parsed;
try {
  parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
} catch (e) {
  console.error('Could not read or parse JSON:', e.message);
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

process.stdout.write(`${pem}\n`);
