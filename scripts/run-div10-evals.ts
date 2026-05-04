import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { readDiv10BrainEnv } from '../src/server/div10Brain/env.ts';
import { getSupabaseAdmin } from '../src/server/div10Brain/supabaseAdmin.ts';
import { runDiv10Evals, writeEvalReport } from '../src/server/evals/runDiv10Evals.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
for (const fileName of ['.env', '.env.local']) {
  const fullPath = path.join(root, fileName);
  if (fs.existsSync(fullPath)) dotenv.config({ path: fullPath, override: false });
}

async function main() {
  const env = readDiv10BrainEnv();
  if (!env) {
    console.error('Missing env for Div 10 Brain / Supabase');
    process.exit(1);
  }
  const supabase = getSupabaseAdmin(env);
  const limit = process.argv[2] ? Number(process.argv[2]) : 200;
  const payload = await runDiv10Evals(supabase, env, { limit: Number.isFinite(limit) ? limit : 200 });
  const outDir = path.join(root, 'eval-results');
  const fp = await writeEvalReport(outDir, payload);
  console.log('Wrote', fp);
  console.log(JSON.stringify(payload.summary, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
