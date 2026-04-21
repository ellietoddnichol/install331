import type { CatalogItem } from '../../types';
import type { TakeoffLineRecord } from '../types/estimator';
import { formatCurrencySafe, formatLaborDurationMinutes } from '../../utils/numberFormat';
import { scopeBucketLabel } from './intakeEstimateReview';
import type { ScopeLineException } from './scopeReviewExceptions';

/** Scope bucket: prefer persisted intake classifier; else category / source proxy. */
export function scopeReviewBucketLabel(line: TakeoffLineRecord): string {
  if (line.intakeScopeBucket) return scopeBucketLabel(line.intakeScopeBucket);
  const cat = String(line.category || '').trim();
  if (cat && cat.toLowerCase() !== 'uncategorized') return cat;
  const sub = String(line.subcategory || '').trim();
  if (sub) return sub;
  const st = String(line.sourceType || '').trim().toLowerCase();
  if (st === 'manual') return 'Manual entry';
  if (st) return st.replace(/_/g, ' ');
  return 'Scope line';
}

export function sourceTypeLabel(line: TakeoffLineRecord): string {
  const st = String(line.sourceType || '').trim().toLowerCase();
  if (!st) return 'Import';
  return st.replace(/_/g, ' ');
}

/** Estimator-facing catalog link copy (SKU, vendor, typical $ / install time when available). */
export function catalogMatchSummary(line: TakeoffLineRecord, catalogById: Map<string, CatalogItem>): string {
  if (!line.catalogItemId) {
    const sku = String(line.sku || '').trim();
    return sku
      ? `No catalog pick yet — spreadsheet SKU “${sku}” is a starting hint for search.`
      : 'No catalog pick yet — search catalog from the line description.';
  }
  const item = catalogById.get(line.catalogItemId);
  if (!item) {
    return `Linked to catalog — details will appear after sync (ID ${line.catalogItemId.slice(0, 8)}…).`;
  }
  const sku = String(item.sku || '').trim();
  const desc = String(item.description || '').trim();
  const mfr = String(item.manufacturer || item.brand || '').trim();
  const uom = String(item.uom || line.unit || 'EA').trim();
  const titleBits = [mfr, sku && sku !== desc ? sku : null].filter(Boolean);
  const title = titleBits.length ? titleBits.join(' · ') : sku || 'Catalog item';
  const descShort = desc.length > 64 ? `${desc.slice(0, 64)}…` : desc;
  const head = descShort ? `${title} — ${descShort}` : title;
  const mat = Number(item.baseMaterialCost);
  const min = Number(item.baseLaborMinutes);
  const typical =
    Number.isFinite(mat) && mat > 0
      ? `Typical ${formatCurrencySafe(mat)} material`
      : null;
  const labor =
    Number.isFinite(min) && min > 0 ? `${formatLaborDurationMinutes(min)} install / ${uom} (catalog baseline)` : null;
  const tail = [typical, labor].filter(Boolean).join(' · ');
  return tail ? `${head} (${tail})` : `${head} (${uom})`;
}

export function confidenceLabel(line: TakeoffLineRecord, isException: boolean): string {
  const ic = line.intakeMatchConfidence;
  if (ic === 'strong') return 'Strong';
  if (ic === 'possible') return 'Check';
  if (ic === 'none') return 'Weak';
  if (isException) return 'Needs review';
  if (line.catalogItemId) return 'Linked';
  return 'Manual';
}

/** One-line “what to do” for the attention queue (exception kinds + qty context). */
export function attentionActionHeadline(ex: ScopeLineException, line: TakeoffLineRecord): string {
  const qty = Number(line.qty);
  const qtyNote = !Number.isFinite(qty) || qty <= 0 ? 'Set a positive quantity.' : null;
  const parts = [ex.summary, qtyNote].filter(Boolean);
  return parts.join(' ');
}

export function partitionLinesByException(
  lines: TakeoffLineRecord[],
  exceptions: ScopeLineException[]
): { attention: TakeoffLineRecord[]; trusted: TakeoffLineRecord[] } {
  const ids = new Set(exceptions.map((e) => e.lineId));
  const attention: TakeoffLineRecord[] = [];
  const trusted: TakeoffLineRecord[] = [];
  for (const line of lines) {
    if (ids.has(line.id)) attention.push(line);
    else trusted.push(line);
  }
  return { attention, trusted };
}

export function buildCatalogById(catalog: CatalogItem[]): Map<string, CatalogItem> {
  return new Map(catalog.map((c) => [c.id, c]));
}

/** Original document / takeoff text for review (description is the working line; raw source when present). */
export function scopeReviewOriginalLineText(line: TakeoffLineRecord): string {
  const desc = String(line.description || '').trim();
  const ref = String(line.sourceRef || '').trim();
  if (ref && ref !== desc && ref.length < 200) {
    return `${desc} — source: ${ref}`;
  }
  return desc || '—';
}
