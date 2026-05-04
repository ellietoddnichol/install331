import type { CatalogReviewQueueKey } from '../../shared/catalogReviewQueues.ts';
import {
  catalogReviewCatalogSearchPath,
  guessCatalogReviewSkuToken,
  mergeCatalogReviewSources,
  resolveCatalogReviewExportLines,
} from '../../shared/catalogReviewQueues.ts';
import type { CatalogSyncRunAuditSummary } from '../../shared/types/catalogSyncAudit.ts';
import { parseCatalogSyncRunContextJson } from '../../shared/types/catalogSyncAudit.ts';
import { parseCatalogSyncWarningsPayload } from './catalogSyncWorkbookValidation.ts';

export type CatalogSyncRunCsvSourceRow = {
  id: string;
  attempted_at: string;
  warnings_json: string | null;
  message: string | null;
  run_context_json?: string | null;
};

function csvEscape(value: string): string {
  const v = String(value ?? '');
  if (/[",\n\r]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

export function buildCatalogReviewCsv(input: { queue: CatalogReviewQueueKey; run: CatalogSyncRunCsvSourceRow }): {
  csv: string;
  rowCount: number;
} | null {
  const parsed = parseCatalogSyncWarningsPayload(input.run.warnings_json);
  const audit: CatalogSyncRunAuditSummary | undefined = parsed.audit;
  const merged = mergeCatalogReviewSources(parsed.warnings, input.run.message);
  const lines = resolveCatalogReviewExportLines(input.queue, merged, audit);
  if (!lines.length) return null;

  const ctx = parseCatalogSyncRunContextJson(input.run.run_context_json ?? null);
  const spreadsheetId = ctx?.spreadsheetId ?? '';
  const itemsTab = ctx?.tabs?.itemsFetch ?? '';

  const header = [
    'run_id',
    'attempted_at',
    'spreadsheet_id',
    'items_fetch_tab',
    'queue',
    'detail',
    'primary_search_token',
    'catalog_search_path',
  ];

  const body = lines.map((detail) => {
    const token = guessCatalogReviewSkuToken(detail);
    const path = catalogReviewCatalogSearchPath(token);
    return [
      csvEscape(input.run.id),
      csvEscape(input.run.attempted_at),
      csvEscape(spreadsheetId),
      csvEscape(itemsTab),
      csvEscape(input.queue),
      csvEscape(detail),
      csvEscape(token ?? ''),
      csvEscape(path),
    ].join(',');
  });

  return {
    csv: [header.join(','), ...body].join('\n'),
    rowCount: lines.length,
  };
}
