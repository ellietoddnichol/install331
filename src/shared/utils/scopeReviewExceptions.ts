import type { TakeoffLineRecord } from '../types/estimator';

export type ScopeLineExceptionKind =
  | 'no_catalog_match'
  | 'zero_qty'
  | 'uncategorized'
  | 'missing_description';

export interface ScopeLineException {
  lineId: string;
  kinds: ScopeLineExceptionKind[];
  summary: string;
}

function summarize(kinds: ScopeLineExceptionKind[]): string {
  const labels: Record<ScopeLineExceptionKind, string> = {
    no_catalog_match: 'Not linked to catalog',
    zero_qty: 'Qty needs review',
    uncategorized: 'Category missing',
    missing_description: 'Description missing',
  };
  return kinds.map((k) => labels[k]).join(' · ');
}

/** Heuristic: manual entry lines are not flagged as catalog exceptions unless they carry a SKU hint. */
function needsCatalogAttention(line: TakeoffLineRecord): boolean {
  const st = String(line.sourceType || '').toLowerCase();
  if (st === 'manual') {
    const sku = String(line.sku || '').trim();
    return sku.length > 0 && !line.catalogItemId;
  }
  return !line.catalogItemId;
}

export function listScopeExceptionLines(lines: TakeoffLineRecord[]): ScopeLineException[] {
  return lines
    .map((line) => {
      const kinds: ScopeLineExceptionKind[] = [];
      const desc = String(line.description || '').trim();
      if (!desc) kinds.push('missing_description');
      const qty = Number(line.qty);
      if (!Number.isFinite(qty) || qty <= 0) kinds.push('zero_qty');
      if (needsCatalogAttention(line)) kinds.push('no_catalog_match');
      const cat = String(line.category || '').trim();
      if (!cat || cat.toLowerCase() === 'uncategorized') {
        const st = String(line.sourceType || '').toLowerCase();
        if (st !== 'manual') kinds.push('uncategorized');
      }
      return { line, kinds };
    })
    .filter(({ kinds }) => kinds.length > 0)
    .map(({ line, kinds }) => ({
      lineId: line.id,
      kinds,
      summary: summarize(kinds),
    }));
}

export function scopeExceptionCount(lines: TakeoffLineRecord[]): number {
  return listScopeExceptionLines(lines).length;
}
