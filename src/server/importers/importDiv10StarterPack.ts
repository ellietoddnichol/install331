import fs from 'fs';
import path from 'path';
import type { SupabaseClient } from '@supabase/supabase-js';
import { parse as parseCsv } from 'csv-parse/sync';
import { importCatalogAliasesCsv } from './importCatalogAliasesCsv.ts';
import { importProposalClausesCsv } from './importProposalClausesCsv.ts';
import { registerKnowledgeDocument } from '../div10Brain/ingestion/registerKnowledgeDocument.ts';

function readRows(filePath: string): Record<string, string>[] {
  const raw = fs.readFileSync(filePath, 'utf8');
  return parseCsv(raw, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true,
  }) as Record<string, string>[];
}

function requireCols(row: Record<string, string>, cols: string[], rowLabel: string) {
  for (const c of cols) {
    if (row[c] === undefined || String(row[c]).trim() === '') {
      throw new Error(`${rowLabel}: missing "${c}"`);
    }
  }
}

export type StarterPackSummary = {
  packRoot: string;
  catalog: { rowsRead: number; upserted: number };
  aliases: { inserted: number; skipped: number; rowsRead: number };
  modifiers: { upserted: number };
  bundles: { templates: number; items: number };
  clauses: { inserted: number; rowsRead: number };
  training: { inserted: number };
  knowledgeManifest: { registered: number; skippedMissingFile: number };
};

/**
 * Import Div 10 starter pack CSVs (extracted ZIP folder) into Supabase Div 10 Brain tables.
 */
export async function importDiv10StarterPack(supabase: SupabaseClient, packRoot: string): Promise<StarterPackSummary> {
  const catalogPath = path.join(packRoot, 'starter_catalog_items.csv');
  const aliasPath = path.join(packRoot, 'starter_catalog_aliases.csv');
  const modPath = path.join(packRoot, 'starter_modifier_rules.csv');
  const bundleTplPath = path.join(packRoot, 'starter_bundle_templates.csv');
  const bundleItemsPath = path.join(packRoot, 'starter_bundle_template_items.csv');
  const clausesPath = path.join(packRoot, 'starter_proposal_clauses.csv');
  const trainingPath = path.join(packRoot, 'starter_training_examples.csv');
  const manifestPath = path.join(packRoot, 'knowledge_sources_manifest.csv');

  const catalogRows = readRows(catalogPath);
  const catBatch: Record<string, unknown>[] = [];
  for (let i = 0; i < catalogRows.length; i++) {
    const row = catalogRows[i];
    requireCols(row, ['sku', 'category', 'normalized_name'], `catalog row ${i + 2}`);
    const brand = String(row.brand || '').trim() || 'Generic';
    const descParts = [row.model, row.series, row.normalized_name].map((s) => String(s || '').trim()).filter(Boolean);
    const description = descParts.length ? descParts.join(' · ') : String(row.normalized_name).trim();
    catBatch.push({
      sku: String(row.sku).trim(),
      brand,
      category: String(row.category).trim(),
      subcategory: row.subcategory?.trim() || null,
      normalized_name: String(row.normalized_name).trim(),
      description,
      finish: null,
      material: null,
      mounting: null,
      install_minutes: row.install_minutes?.trim() ? Number(row.install_minutes) : null,
      unit: row.unit?.trim() || null,
      active: String(row.active || 'true').toLowerCase() !== 'false' && row.active !== '0',
      source_file_path: row.source_file?.trim() || null,
      source_row_ref: row.source_sheet?.trim() || null,
      updated_at: new Date().toISOString(),
    });
  }
  let upserted = 0;
  for (let i = 0; i < catBatch.length; i += 50) {
    const slice = catBatch.slice(i, i + 50);
    const { error } = await supabase.from('catalog_items').upsert(slice, { onConflict: 'sku' });
    if (error) throw new Error(`catalog_items upsert: ${error.message}`);
    upserted += slice.length;
  }

  const aliasSummary = await importCatalogAliasesCsv(supabase, aliasPath);

  const modRows = readRows(modPath);
  const modBatch: Record<string, unknown>[] = [];
  for (let i = 0; i < modRows.length; i++) {
    const row = modRows[i];
    requireCols(row, ['modifier_key'], `modifier row ${i + 2}`);
    const key = String(row.modifier_key).trim();
    const applies = String(row.applies_to_categories || '')
      .split('|')
      .map((s) => s.trim())
      .filter(Boolean);
    const notesObj = {
      add_labor_minutes: row.add_labor_minutes,
      add_material_cost: row.add_material_cost,
      percent_labor: row.percent_labor,
      percent_material: row.percent_material,
    };
    modBatch.push({
      modifier_key: key,
      label: key,
      applies_to_categories: applies,
      applies_to_conditions: [] as string[],
      pricing_effect_type: 'starter_workbook',
      default_value: null,
      notes: JSON.stringify(notesObj),
      active: String(row.active || 'true').toLowerCase() !== 'false',
      updated_at: new Date().toISOString(),
    });
  }
  if (modBatch.length) {
    const { error } = await supabase.from('modifier_rules').upsert(modBatch, { onConflict: 'modifier_key' });
    if (error) throw new Error(`modifier_rules: ${error.message}`);
  }

  const tplRows = readRows(bundleTplPath);
  const bundleIdToUuid = new Map<string, string>();
  for (let i = 0; i < tplRows.length; i++) {
    const row = tplRows[i];
    requireCols(row, ['bundle_id', 'bundle_name'], `bundle template row ${i + 2}`);
    const bundle_id = String(row.bundle_id).trim();
    const bundle_name = String(row.bundle_name).trim();
    const notes = [`starter_bundle_id:${bundle_id}`, row.included_modifiers?.trim() ? `included_modifiers:${row.included_modifiers.trim()}` : '']
      .filter(Boolean)
      .join('\n');
    const { data: existing } = await supabase.from('bundle_templates').select('id').eq('bundle_name', bundle_name).maybeSingle();
    const payload = {
      bundle_name,
      category: row.category?.trim() || null,
      notes: notes || null,
      active: String(row.active || '1') !== '0' && String(row.active).toLowerCase() !== 'false',
      updated_at: new Date().toISOString(),
    };
    if (existing?.id) {
      const { error } = await supabase.from('bundle_templates').update(payload).eq('id', existing.id);
      if (error) throw new Error(error.message);
      bundleIdToUuid.set(bundle_id, existing.id as string);
    } else {
      const { data, error } = await supabase.from('bundle_templates').insert(payload).select('id').single();
      if (error) throw new Error(error.message);
      bundleIdToUuid.set(bundle_id, data.id as string);
    }
  }

  let bundleItemsInserted = 0;
  for (const bid of bundleIdToUuid.keys()) {
    const uuid = bundleIdToUuid.get(bid);
    if (uuid) await supabase.from('bundle_template_items').delete().eq('bundle_template_id', uuid);
  }
  const biRows = readRows(bundleItemsPath);
  for (let i = 0; i < biRows.length; i++) {
    const row = biRows[i];
    requireCols(row, ['bundle_id', 'sku', 'quantity'], `bundle item row ${i + 2}`);
    const tid = bundleIdToUuid.get(String(row.bundle_id).trim());
    if (!tid) throw new Error(`Unknown bundle_id ${row.bundle_id}`);
    const sku = String(row.sku).trim();
    const { data: item, error: cErr } = await supabase.from('catalog_items').select('id').eq('sku', sku).maybeSingle();
    if (cErr) throw new Error(cErr.message);
    if (!item?.id) throw new Error(`bundle item row ${i + 2}: unknown sku ${sku}`);
    const { error } = await supabase.from('bundle_template_items').insert({
      bundle_template_id: tid,
      catalog_item_id: item.id as string,
      quantity: Number(row.quantity),
      required: String(row.required || 'True').toLowerCase() !== 'false' && row.required !== '0',
      modifier_defaults: null,
    });
    if (error) throw new Error(error.message);
    bundleItemsInserted += 1;
  }

  const clauseSummary = await importProposalClausesCsv(supabase, clausesPath);

  const trRows = readRows(trainingPath);
  let trainingInserted = 0;
  for (let i = 0; i < trRows.length; i++) {
    const row = trRows[i];
    requireCols(row, ['task_type', 'raw_line_text', 'expected_output_json'], `training row ${i + 2}`);
    let outputJson: unknown;
    try {
      outputJson = JSON.parse(String(row.expected_output_json));
    } catch {
      throw new Error(`training row ${i + 2}: invalid expected_output_json`);
    }
    const rawType = String(row.task_type).trim();
    if (['catalog_match', 'modifier_suggestion', 'proposal_draft'].includes(rawType)) {
      continue;
    }
    const task_type =
      rawType === 'line_classification'
        ? 'classify_intake_line'
        : rawType === 'catalog_match'
          ? 'suggest_catalog_match'
          : rawType === 'modifier_suggestion'
            ? 'suggest_modifiers'
            : rawType === 'proposal_draft'
              ? 'draft_proposal_text'
              : rawType;
    const input_json = {
      line_text: String(row.raw_line_text).trim(),
      section_header: row.section_context?.trim() || null,
    };
    const source_ref = `starter_pack:${path.basename(trainingPath)}:${i + 2}:${task_type}`;
    const { data: dup } = await supabase.from('training_examples').select('id').eq('source_ref', source_ref).maybeSingle();
    if (dup?.id) continue;
    const { error } = await supabase.from('training_examples').insert({
      task_type,
      input_json,
      output_json: outputJson,
      approved: false,
      source_ref,
    });
    if (error) throw new Error(error.message);
    trainingInserted += 1;
  }

  let manifestRegistered = 0;
  let manifestSkip = 0;
  if (fs.existsSync(manifestPath)) {
    const mRows = readRows(manifestPath);
    manifestRegistered = mRows.length;
    for (let i = 0; i < mRows.length; i++) {
      const row = mRows[i];
      requireCols(row, ['source_file', 'source_type'], `manifest row ${i + 2}`);
      const source_file = String(row.source_file).trim();
      const doc_type =
        String(row.source_type).includes('cross')
          ? 'cross_reference'
          : String(row.source_type).includes('manufacturer')
            ? 'manufacturer_price_list'
            : String(row.source_type).includes('internal')
              ? 'internal_catalog'
              : 'reference';
      const localTry = path.join(packRoot, 'files', source_file);
      const hasFile = fs.existsSync(localTry);
      const reg = await registerKnowledgeDocument(supabase, {
        storage_bucket: 'manufacturer-docs',
        storage_path: source_file,
        doc_type,
        title: source_file,
        source_kind: String(row.source_type || '').trim() || null,
        brand: null,
        category: null,
        checksum: null,
      });
      if (!hasFile) {
        await supabase
          .from('knowledge_documents')
          .update({
            ingestion_status: 'pending',
            ingestion_error: 'awaiting_upload: file not found in starter pack; upload to Supabase Storage then process.',
            updated_at: new Date().toISOString(),
          })
          .eq('id', reg.id);
        manifestSkip += 1;
      }
    }
  }

  return {
    packRoot,
    catalog: { rowsRead: catalogRows.length, upserted },
    aliases: { inserted: aliasSummary.inserted, skipped: aliasSummary.skipped, rowsRead: aliasSummary.rowsRead },
    modifiers: { upserted: modBatch.length },
    bundles: { templates: tplRows.length, items: bundleItemsInserted },
    clauses: { inserted: clauseSummary.inserted, rowsRead: clauseSummary.rowsRead },
    training: { inserted: trainingInserted },
    knowledgeManifest: { registered: manifestRegistered, skippedMissingFile: manifestSkip },
  };
}
