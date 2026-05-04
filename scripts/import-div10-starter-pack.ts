/**
 * Import extracted starter pack CSVs into Supabase Div 10 Brain tables.
 * Usage: npx tsx scripts/import-div10-starter-pack.ts [path-to-extracted-folder]
 * Default: ./div10_starter_pack_extracted
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { readDiv10BrainEnv } from '../src/server/div10Brain/env.ts';
import { getSupabaseAdmin } from '../src/server/div10Brain/supabaseAdmin.ts';
import { importDiv10StarterPack } from '../src/server/importers/importDiv10StarterPack.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
for (const fileName of ['.env', '.env.local']) {
  const fullPath = path.join(root, fileName);
  if (fs.existsSync(fullPath)) dotenv.config({ path: fullPath, override: false });
}

async function main() {
  const env = readDiv10BrainEnv();
  if (!env) {
    console.error('Missing Supabase/OpenAI env (see docs/div10-brain-env.md).');
    process.exit(1);
  }
  const packRoot = path.resolve(root, process.argv[2] || 'div10_starter_pack_extracted');
  if (!fs.existsSync(packRoot)) {
    console.error('Pack folder not found:', packRoot);
    process.exit(1);
  }
  const supabase = getSupabaseAdmin(env);
  const summary = await importDiv10StarterPack(supabase, packRoot);
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
