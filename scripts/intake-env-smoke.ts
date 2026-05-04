/**
 * Quick check that intake-related env vars are present (no API calls).
 * Run: npx tsx scripts/intake-env-smoke.ts
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

for (const name of ['.env', '.env.local']) {
  const p = path.join(root, name);
  if (fs.existsSync(p)) dotenv.config({ path: p, override: false });
}

const gemini = Boolean((process.env.GEMINI_API_KEY || process.env.GOOGLE_GEMINI_API_KEY || '').trim());
const pdfProvider = String(process.env.UPLOAD_PDF_PROVIDER || 'fallback-text').toLowerCase();
const docAi =
  pdfProvider === 'google-document-ai' &&
  Boolean(process.env.GOOGLE_CLOUD_PROJECT_ID?.trim()) &&
  Boolean(process.env.DOCUMENT_AI_PROCESSOR_ID?.trim());
const adcPath = (process.env.GOOGLE_APPLICATION_CREDENTIALS || '').trim();
const adcFileOk = adcPath ? fs.existsSync(path.isAbsolute(adcPath) ? adcPath : path.join(root, adcPath)) : false;

console.log(
  JSON.stringify(
    {
      GEMINI_API_KEY_or_GOOGLE_GEMINI_API_KEY: gemini ? 'set' : 'missing',
      UPLOAD_PDF_PROVIDER: pdfProvider,
      documentAiReady: docAi && (adcFileOk || Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_FILE)),
      GOOGLE_CLOUD_PROJECT_ID: process.env.GOOGLE_CLOUD_PROJECT_ID?.trim() ? 'set' : 'missing',
      DOCUMENT_AI_PROCESSOR_ID: process.env.DOCUMENT_AI_PROCESSOR_ID?.trim() ? 'set' : 'missing',
      GOOGLE_APPLICATION_CREDENTIALS: adcPath ? (adcFileOk ? `file ok (${adcPath})` : `path set, file not found (${adcPath})`) : 'not set',
    },
    null,
    2
  )
);

if (!gemini) {
  console.warn('\n[intake-env-smoke] Gemini key missing — AI intake will fail until GEMINI_API_KEY is set.');
}
if (pdfProvider === 'google-document-ai' && !docAi) {
  console.warn(
    '\n[intake-env-smoke] UPLOAD_PDF_PROVIDER=google-document-ai but GOOGLE_CLOUD_PROJECT_ID or DOCUMENT_AI_PROCESSOR_ID is missing.'
  );
}
