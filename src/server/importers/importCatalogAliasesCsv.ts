import type { SupabaseClient } from '@supabase/supabase-js';
import { readCsvRecords, requireColumns } from './csvUtils.ts';

export type CatalogAliasesImportSummary = { filePath: string; rowsRead: number; inserted: number; skipped: number };

/**
 * Required: sku, alias_text
 * Resolves catalog_item_id from catalog_items.sku; skips rows when SKU not found.
 */
export async function importCatalogAliasesCsv(
  supabase: SupabaseClient,
  filePath: string
): Promise<CatalogAliasesImportSummary> {
  const rows = readCsvRecords(filePath);
  let inserted = 0;
  let skipped = 0;
  const batch: { catalog_item_id: string; alias_text: string; alias_type: string | null }[] = [];

  const flush = async () => {
    if (!batch.length) return;
    const { error } = await supabase.from('catalog_aliases').insert(batch);
    if (error) throw new Error(error.message);
    inserted += batch.length;
    batch.length = 0;
  };

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    requireColumns(row, ['sku', 'alias_text'], i);
    const sku = String(row.sku).trim();
    const { data: item, error } = await supabase.from('catalog_items').select('id').eq('sku', sku).maybeSingle();
    if (error) throw new Error(error.message);
    if (!item?.id) {
      skipped += 1;
      continue;
    }
    batch.push({
      catalog_item_id: item.id as string,
      alias_text: String(row.alias_text).trim(),
      alias_type: row.alias_type?.trim() || null,
    });
    if (batch.length >= 80) await flush();
  }
  await flush();
  return { filePath, rowsRead: rows.length, inserted, skipped };
}
