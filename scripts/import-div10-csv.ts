/**
 * Usage (from repo root, with .env loaded by tsx + dotenv in server pattern — set env before run):
 *   npx tsx scripts/import-div10-csv.ts catalog ./data/div10-brain/samples/catalog.csv
 *   npx tsx scripts/import-div10-csv.ts modifiers ./data/div10-brain/samples/modifier_rules.csv
 *   npx tsx scripts/import-div10-csv.ts clauses ./data/div10-brain/samples/proposal_clauses.csv
 *   npx tsx scripts/import-div10-csv.ts bundles ./data/div10-brain/samples/bundle_templates.csv ./data/div10-brain/samples/bundle_template_items.csv
 *   npx tsx scripts/import-div10-csv.ts estimate-examples ./data/div10-brain/samples/estimate_examples.csv
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { readDiv10BrainEnv } from '../src/server/div10Brain/env.ts';
import { getSupabaseAdmin } from '../src/server/div10Brain/supabaseAdmin.ts';
import { importCatalogCsv } from '../src/server/importers/importCatalogCsv.ts';
import { importModifierRulesCsv } from '../src/server/importers/importModifierRulesCsv.ts';
import { importProposalClausesCsv } from '../src/server/importers/importProposalClausesCsv.ts';
import { importBundleTemplatesCsv } from '../src/server/importers/importBundleTemplatesCsv.ts';
import { importEstimateExamplesCsv } from '../src/server/importers/importEstimateExamplesCsv.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
for (const fileName of ['.env', '.env.local']) {
  const fullPath = path.join(root, fileName);
  if (fs.existsSync(fullPath)) dotenv.config({ path: fullPath, override: false });
}

async function main() {
  const [, , kind, ...rest] = process.argv;
  if (!kind || !rest[0]) {
    console.error('Usage: tsx scripts/import-div10-csv.ts <catalog|modifiers|clauses|bundles|estimate-examples> <paths...>');
    process.exit(1);
  }
  const env = readDiv10BrainEnv();
  if (!env) {
    console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / OPENAI_API_KEY');
    process.exit(1);
  }
  const supabase = getSupabaseAdmin(env);
  const abs = (p: string) => path.isAbsolute(p) ? p : path.join(root, p);

  if (kind === 'catalog') {
    const summary = await importCatalogCsv(supabase, abs(rest[0]));
    console.log(JSON.stringify(summary, null, 2));
    return;
  }
  if (kind === 'modifiers') {
    const summary = await importModifierRulesCsv(supabase, abs(rest[0]));
    console.log(JSON.stringify(summary, null, 2));
    return;
  }
  if (kind === 'clauses') {
    const summary = await importProposalClausesCsv(supabase, abs(rest[0]));
    console.log(JSON.stringify(summary, null, 2));
    return;
  }
  if (kind === 'bundles') {
    if (!rest[1]) {
      console.error('bundles requires two paths: templates.csv items.csv');
      process.exit(1);
    }
    const summary = await importBundleTemplatesCsv(supabase, abs(rest[0]), abs(rest[1]));
    console.log(JSON.stringify(summary, null, 2));
    return;
  }
  if (kind === 'estimate-examples') {
    const summary = await importEstimateExamplesCsv(supabase, abs(rest[0]));
    console.log(JSON.stringify(summary, null, 2));
    return;
  }
  console.error('Unknown kind:', kind);
  process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
