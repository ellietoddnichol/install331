import type { NormalizedIntakeItem, ValidationResult } from '../../../shared/types/intake.ts';
import { normalizeComparableText } from '../metadataExtractorService.ts';

const VALID_UNITS = new Set(['EA', 'EACH', 'LF', 'FT', 'SF', 'SY', 'LS', 'SET', 'PAIR', 'PR', 'HR', 'DAY', 'WK', 'MO', 'BOX', 'PKG', 'CASE', 'CS', 'GAL', 'LB']);

function looksLikeModifier(text: string): boolean {
  return /(finish add|powder coat|security screws|add on|adder|upgrade|extra labor|extra material)/i.test(text);
}

function looksLikeRoomHeader(text: string): boolean {
  const normalized = normalizeComparableText(text);
  if (!normalized) return false;
  return /^(room|area|phase)\b/.test(normalized) || /\b(vestibule|restroom|corridor|lobby|break room|office)\b/.test(normalized);
}

export function validateNormalizedItems(items: NormalizedIntakeItem[]): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const correctedItems = items.map((item) => ({ ...item, notes: [...item.notes] }));

  if (!correctedItems.length) {
    return {
      isValid: false,
      errors: ['No parsed items were extracted from the upload.'],
      warnings: ['Manual review or a fillable intake template is recommended.'],
      correctedItems,
    };
  }

  const duplicateKeys = new Set<string>();
  const seenKeys = new Set<string>();
  const roomNames = new Set(correctedItems.map((item) => normalizeComparableText(item.roomName || '')).filter(Boolean));

  correctedItems.forEach((item, index) => {
    const sourceLabel = `${item.sourceRef.sheetName || `page ${item.sourceRef.pageNumber || '?'}`}:${item.sourceRef.rowNumber || item.sourceRef.chunkId || index + 1}`;
    if (!item.description.trim()) {
      errors.push(`Parsed item ${sourceLabel} is missing a description.`);
    }
    if (item.unit && !VALID_UNITS.has(item.unit.toUpperCase())) {
      warnings.push(`Item ${sourceLabel} has an unrecognized unit (${item.unit}).`);
    }
    if (item.quantity === null && item.unit) {
      warnings.push(`Item ${sourceLabel} has a unit but no quantity.`);
    }
    if (looksLikeModifier(item.description) && item.itemType !== 'modifier') {
      item.itemType = 'modifier';
      item.notes.push('Validator reclassified this line as a modifier.');
      warnings.push(`Item ${sourceLabel} looked like a modifier and was reclassified.`);
    }
    if (looksLikeRoomHeader(item.description) && item.quantity === null) {
      warnings.push(`Item ${sourceLabel} may be a room header rather than a scope line.`);
    }
    if (!item.category && (item.manufacturer || item.model)) {
      warnings.push(`Item ${sourceLabel} has manufacturer/model data but no category.`);
    }
    if (!item.roomName && roomNames.size > 1) {
      warnings.push(`Item ${sourceLabel} has no room assignment even though multiple rooms were detected.`);
    }
    const bestCatalogCandidate = item.catalogMatchCandidates?.[0];
    if (item.rawHeader && (!bestCatalogCandidate || bestCatalogCandidate.matchMethod === 'unmatched')) {
      warnings.push(`Item ${sourceLabel} from header "${item.rawHeader}" could not be matched to the catalog.`);
    } else if (bestCatalogCandidate && bestCatalogCandidate.confidence < 0.75) {
      warnings.push(`Item ${sourceLabel} has an uncertain catalog match (${bestCatalogCandidate.matchedName || item.rawHeader || item.description}).`);
    }

    const duplicateKey = [normalizeComparableText(item.roomName || ''), normalizeComparableText(item.description), item.quantity ?? '', (item.unit || '').toUpperCase()].join('|');
    if (seenKeys.has(duplicateKey)) duplicateKeys.add(duplicateKey);
    else seenKeys.add(duplicateKey);
  });

  duplicateKeys.forEach((key) => {
    warnings.push(`Possible duplicate parsed item detected (${key}).`);
  });

  return {
    isValid: errors.length === 0,
    errors: Array.from(new Set(errors)),
    warnings: Array.from(new Set(warnings)),
    correctedItems,
  };
}