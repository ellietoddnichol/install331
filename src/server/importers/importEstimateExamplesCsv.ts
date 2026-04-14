import type { SupabaseClient } from '@supabase/supabase-js';
import { readCsvRecords, requireColumns, splitPipeList } from './csvUtils.ts';

export type EstimateExamplesImportSummary = { filePath: string; rowsRead: number; inserted: number };

/**
 * Required: raw_line_text
 * Optional: normalized_line_text, section_context, project_context (JSON), chosen_catalog_item_id, accepted_modifiers (pipe), review_outcome, estimator_notes, source_project_id
 */
export async function importEstimateExamplesCsv(
  supabase: SupabaseClient,
  filePath: string
): Promise<EstimateExamplesImportSummary> {
  const rows = readCsvRecords(filePath);
  const batch: Record<string, unknown>[] = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    requireColumns(row, ['raw_line_text'], i);
    let project_context: unknown = null;
    if (row.project_context?.trim()) {
      try {
        project_context = JSON.parse(String(row.project_context));
      } catch {
        throw new Error(`Row ${i + 2}: invalid project_context JSON`);
      }
    }
    batch.push({
      source_project_id: row.source_project_id?.trim() || null,
      raw_line_text: String(row.raw_line_text).trim(),
      normalized_line_text: row.normalized_line_text?.trim() || null,
      section_context: row.section_context?.trim() || null,
      project_context,
      chosen_catalog_item_id: row.chosen_catalog_item_id?.trim() || null,
      accepted_modifiers: splitPipeList(row.accepted_modifiers),
      review_outcome: row.review_outcome?.trim() || null,
      estimator_notes: row.estimator_notes?.trim() || null,
    });
  }
  if (!batch.length) return { filePath, rowsRead: 0, inserted: 0 };
  const { error } = await supabase.from('estimate_examples').insert(batch);
  if (error) throw new Error(error.message);
  return { filePath, rowsRead: rows.length, inserted: batch.length };
}
