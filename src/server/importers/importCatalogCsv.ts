import type { SupabaseClient } from '@supabase/supabase-js';
import { readCsvRecords, requireColumns } from './csvUtils.ts';

export type CatalogImportSummary = {
  filePath: string;
  rowsRead: number;
  upserted: number;
};

/**
 * Required columns: sku, brand, category, normalized_name
 * Optional: subcategory, description, finish, material, mounting, install_minutes, unit, active, source_file_path, source_row_ref
 */
export async function importCatalogCsv(supabase: SupabaseClient, filePath: string): Promise<CatalogImportSummary> {
  const rows = readCsvRecords(filePath);
  let upserted = 0;
  const batch: Record<string, unknown>[] = [];

  const flush = async () => {
    if (!batch.length) return;
    const { error } = await supabase.from('catalog_items').upsert(batch, { onConflict: 'sku' });
    if (error) throw new Error(error.message);
    upserted += batch.length;
    batch.length = 0;
  };

  for (let i = 0; i < rows.length; i++) {
    try {
      const row = rows[i];
      requireColumns(row, ['sku', 'brand', 'category', 'normalized_name'], i);
      batch.push({
        sku: String(row.sku).trim(),
        brand: String(row.brand).trim(),
        category: String(row.category).trim(),
        subcategory: row.subcategory?.trim() || null,
        normalized_name: String(row.normalized_name).trim(),
        description: row.description?.trim() || null,
        finish: row.finish?.trim() || null,
        material: row.material?.trim() || null,
        mounting: row.mounting?.trim() || null,
        install_minutes: row.install_minutes?.trim() ? Number(row.install_minutes) : null,
        unit: row.unit?.trim() || null,
        active: row.active?.trim().toLowerCase() === 'false' || row.active === '0' ? false : true,
        source_file_path: row.source_file_path?.trim() || null,
        source_row_ref: row.source_row_ref?.trim() || null,
        updated_at: new Date().toISOString(),
      });
      if (batch.length >= 40) await flush();
    } catch (e: unknown) {
      throw e instanceof Error ? e : new Error(String(e));
    }
  }
  await flush();

  return { filePath, rowsRead: rows.length, upserted };
}
