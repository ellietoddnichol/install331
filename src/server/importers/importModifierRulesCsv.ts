import type { SupabaseClient } from '@supabase/supabase-js';
import { readCsvRecords, requireColumns, splitPipeList, parseBool } from './csvUtils.ts';

export type ModifierImportSummary = { filePath: string; rowsRead: number; upserted: number };

/**
 * Required: modifier_key, label
 * Optional: applies_to_categories (pipe), applies_to_conditions (pipe), pricing_effect_type, default_value, notes, active
 */
export async function importModifierRulesCsv(supabase: SupabaseClient, filePath: string): Promise<ModifierImportSummary> {
  const rows = readCsvRecords(filePath);
  const batch: Record<string, unknown>[] = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    requireColumns(row, ['modifier_key', 'label'], i);
    batch.push({
      modifier_key: String(row.modifier_key).trim(),
      label: String(row.label).trim(),
      applies_to_categories: splitPipeList(row.applies_to_categories),
      applies_to_conditions: splitPipeList(row.applies_to_conditions),
      pricing_effect_type: row.pricing_effect_type?.trim() || null,
      default_value: row.default_value?.trim() ? Number(row.default_value) : null,
      notes: row.notes?.trim() || null,
      active: parseBool(row.active, true),
      updated_at: new Date().toISOString(),
    });
  }
  if (!batch.length) return { filePath, rowsRead: 0, upserted: 0 };
  const { error } = await supabase.from('modifier_rules').upsert(batch, { onConflict: 'modifier_key' });
  if (error) throw new Error(error.message);
  return { filePath, rowsRead: rows.length, upserted: batch.length };
}
