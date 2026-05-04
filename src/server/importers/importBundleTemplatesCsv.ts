import type { SupabaseClient } from '@supabase/supabase-js';
import { readCsvRecords, requireColumns, parseBool } from './csvUtils.ts';

export type BundleImportSummary = {
  templatesPath: string;
  itemsPath: string;
  templatesUpserted: number;
  itemsInserted: number;
};

/**
 * templates CSV: bundle_name (required), category, notes, active
 * items CSV: bundle_name (required), sku (required), quantity (required), required, modifier_defaults (JSON string)
 */
export async function importBundleTemplatesCsv(
  supabase: SupabaseClient,
  templatesPath: string,
  itemsPath: string
): Promise<BundleImportSummary> {
  const tRows = readCsvRecords(templatesPath);
  const nameToId = new Map<string, string>();
  const mergedByName = new Map<string, (typeof tRows)[0]>();
  for (let i = 0; i < tRows.length; i++) {
    const row = tRows[i];
    requireColumns(row, ['bundle_name'], i);
    const bundle_name = String(row.bundle_name).trim();
    mergedByName.set(bundle_name, row);
  }

  for (const [bundle_name, row] of mergedByName) {
    const { data: existing } = await supabase.from('bundle_templates').select('id').eq('bundle_name', bundle_name).maybeSingle();
    const payload = {
      bundle_name,
      category: row.category?.trim() || null,
      notes: row.notes?.trim() || null,
      active: parseBool(row.active, true),
      updated_at: new Date().toISOString(),
    };
    if (existing?.id) {
      const { error } = await supabase.from('bundle_templates').update(payload).eq('id', existing.id);
      if (error) throw new Error(error.message);
      nameToId.set(bundle_name, existing.id as string);
    } else {
      const { data, error } = await supabase.from('bundle_templates').insert(payload).select('id').single();
      if (error) throw new Error(error.message);
      nameToId.set(bundle_name, data.id as string);
    }
  }

  const iRows = readCsvRecords(itemsPath);
  let itemsInserted = 0;
  for (const bundleName of nameToId.keys()) {
    const bid = nameToId.get(bundleName);
    if (!bid) continue;
    await supabase.from('bundle_template_items').delete().eq('bundle_template_id', bid);
  }

  for (let i = 0; i < iRows.length; i++) {
    const row = iRows[i];
    requireColumns(row, ['bundle_name', 'sku', 'quantity'], i);
    const bundle_name = String(row.bundle_name).trim();
    const bid = nameToId.get(bundle_name);
    if (!bid) throw new Error(`Row ${i + 2}: unknown bundle_name "${bundle_name}" (not in templates file)`);
    const sku = String(row.sku).trim();
    const { data: item, error: cErr } = await supabase.from('catalog_items').select('id').eq('sku', sku).maybeSingle();
    if (cErr) throw new Error(cErr.message);
    if (!item?.id) throw new Error(`Row ${i + 2}: unknown sku "${sku}" in catalog_items`);
    let modifier_defaults: unknown = null;
    if (row.modifier_defaults?.trim()) {
      try {
        modifier_defaults = JSON.parse(String(row.modifier_defaults));
      } catch {
        throw new Error(`Row ${i + 2}: invalid modifier_defaults JSON`);
      }
    }
    const { error } = await supabase.from('bundle_template_items').insert({
      bundle_template_id: bid,
      catalog_item_id: item.id as string,
      quantity: Number(row.quantity),
      required: parseBool(row.required, true),
      modifier_defaults,
    });
    if (error) throw new Error(error.message);
    itemsInserted += 1;
  }

  return {
    templatesPath,
    itemsPath,
    templatesUpserted: mergedByName.size,
    itemsInserted,
  };
}
