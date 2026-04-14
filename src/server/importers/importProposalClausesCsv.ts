import type { SupabaseClient } from '@supabase/supabase-js';
import { readCsvRecords, requireColumns, splitPipeList, parseBool } from './csvUtils.ts';

export type ProposalClausesImportSummary = { filePath: string; rowsRead: number; inserted: number };

/**
 * Required: clause_type, body
 * Optional: id (uuid update), title, applicable_categories (pipe), applicable_conditions (pipe), active
 */
export async function importProposalClausesCsv(
  supabase: SupabaseClient,
  filePath: string
): Promise<ProposalClausesImportSummary> {
  const rows = readCsvRecords(filePath);
  let inserted = 0;
  const updates: Record<string, unknown>[] = [];
  const inserts: Record<string, unknown>[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    requireColumns(row, ['clause_type', 'body'], i);
    const payload = {
      clause_type: String(row.clause_type).trim(),
      title: row.title?.trim() || null,
      body: String(row.body).trim(),
      applicable_categories: splitPipeList(row.applicable_categories),
      applicable_conditions: splitPipeList(row.applicable_conditions),
      active: parseBool(row.active, true),
      updated_at: new Date().toISOString(),
    };
    const id = row.id?.trim();
    if (id) updates.push({ id, ...payload });
    else inserts.push(payload);
  }

  if (inserts.length) {
    const { error } = await supabase.from('proposal_clauses').insert(inserts);
    if (error) throw new Error(error.message);
    inserted += inserts.length;
  }
  for (const upd of updates) {
    const { id, ...rest } = upd;
    const { error } = await supabase.from('proposal_clauses').update(rest).eq('id', String(id));
    if (error) throw new Error(error.message);
    inserted += 1;
  }

  return { filePath, rowsRead: rows.length, inserted };
}
