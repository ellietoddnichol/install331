import type { NormalizedIntakeItem, ValidationResult } from '../../../shared/types/intake.ts';
import { looksLikeModifierLine } from './intakeSemantics.ts';
import {
  looksLikeIntakeContactOrNonScopeLine,
  looksLikeIntakePricingSummaryOrDisclaimerLine,
  looksLikeIntakeSectionHeaderOrTitleLine,
} from '../../../shared/utils/intakeTextGuards.ts';
import { normalizeIntakeUnit } from '../../../shared/utils/intakeNormalization.ts';
import { intakeAsText, normalizeComparableText } from '../metadataExtractorService.ts';

/**
 * PDF text has no reliable table columns for rooms; Gemini/deterministic "room" strings are usually headers or noise.
 * One room bucket avoids hundreds of false "missing room" warnings and matches typical single-scope imports.
 */
function coalescePdfRooms(items: NormalizedIntakeItem[], warnings: string[]): void {
  const pdfItems = items.filter((item) => item.sourceType === 'pdf');
  if (!pdfItems.length) return;

  const hadRoomLabels = pdfItems.some((item) => intakeAsText(item.roomName || ''));
  if (hadRoomLabels) {
    warnings.push(
      'PDF import: room labels from text extraction are unreliable, so every line was assigned to "General". Split into rooms in the workspace if you need them.'
    );
  }
  for (const item of pdfItems) {
    item.roomName = 'General';
  }
}

const VALID_UNITS = new Set(['EA', 'EACH', 'LF', 'FT', 'SF', 'SY', 'LS', 'SET', 'PAIR', 'PR', 'HR', 'DAY', 'WK', 'MO', 'BOX', 'PKG', 'CASE', 'CS', 'GAL', 'LB']);

function looksLikeRoomHeader(text: string): boolean {
  const normalized = normalizeComparableText(text);
  if (!normalized) return false;
  return /^(room|area|phase)\b/.test(normalized) || /\b(vestibule|restroom|corridor|lobby|break room|office)\b/.test(normalized);
}

export function validateNormalizedItems(items: NormalizedIntakeItem[]): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  let correctedItems = items.map((item) => ({ ...item, notes: [...item.notes] }));

  let sectionHeaderLinesDropped = 0;
  let disclaimerOrPricingLinesDropped = 0;
  let contactOrNonScopeDropped = 0;
  correctedItems = correctedItems.filter((item) => {
    const desc = item.description || '';
    if (looksLikeIntakeContactOrNonScopeLine(desc)) {
      contactOrNonScopeDropped += 1;
      return false;
    }
    if (looksLikeIntakePricingSummaryOrDisclaimerLine(desc)) {
      disclaimerOrPricingLinesDropped += 1;
      return false;
    }
    if (looksLikeIntakeSectionHeaderOrTitleLine(desc)) {
      sectionHeaderLinesDropped += 1;
      return false;
    }
    return true;
  });
  correctedItems = correctedItems.map((item) => {
    const nu = normalizeIntakeUnit(item.unit);
    if (nu) return { ...item, unit: nu };
    return item;
  });
  if (contactOrNonScopeDropped > 0) {
    warnings.push(
      `${contactOrNonScopeDropped} line(s) were removed as letterhead, contact info, or other non-scope rows (aligned with Gemini row classifier rules).`
    );
  }
  if (disclaimerOrPricingLinesDropped > 0) {
    warnings.push(
      `${disclaimerOrPricingLinesDropped} line(s) were removed as pricing summaries, totals, or contact/quote disclaimers (not scope items).`
    );
  }
  if (sectionHeaderLinesDropped > 0) {
    warnings.push(
      `${sectionHeaderLinesDropped} line(s) were removed as section titles or table headers (not scope items).`
    );
  }

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

  coalescePdfRooms(correctedItems, warnings);

  const roomNames = new Set(correctedItems.map((item) => normalizeComparableText(item.roomName || '')).filter(Boolean));

  const missingRoomLabels: string[] = [];
  const pdfBulk = {
    badUnit: 0,
    unitNoQty: 0,
    modifierReclass: 0,
    roomHeaderMaybe: 0,
    uncertainCatalog: 0,
    unmatchedCatalog: 0,
    mfrNoCategory: 0,
  };

  correctedItems.forEach((item, index) => {
    const sourceLabel = `${item.sourceRef.sheetName || `page ${item.sourceRef.pageNumber || '?'}`}:${item.sourceRef.rowNumber || item.sourceRef.chunkId || index + 1}`;
    const isPdf = item.sourceType === 'pdf';
    if (!item.description.trim()) {
      errors.push(`Parsed item ${sourceLabel} is missing a description.`);
    }
    if (item.unit && !VALID_UNITS.has(item.unit.toUpperCase())) {
      if (isPdf) pdfBulk.badUnit += 1;
      else warnings.push(`Item ${sourceLabel} has an unrecognized unit (${item.unit}).`);
    }
    if (item.quantity === null && item.unit) {
      if (isPdf) pdfBulk.unitNoQty += 1;
      else warnings.push(`Item ${sourceLabel} has a unit but no quantity.`);
    }
    if (
      looksLikeModifierLine(item.description) &&
      item.itemType !== 'modifier' &&
      !item.semanticTags?.includes('field_assembly')
    ) {
      item.itemType = 'modifier';
      item.notes.push('Validator reclassified this line as a modifier.');
      if (isPdf) pdfBulk.modifierReclass += 1;
      else warnings.push(`Item ${sourceLabel} looked like a modifier and was reclassified.`);
    }
    if (looksLikeRoomHeader(item.description) && item.quantity === null) {
      if (isPdf) pdfBulk.roomHeaderMaybe += 1;
      else warnings.push(`Item ${sourceLabel} may be a room header rather than a scope line.`);
    }
    if (!item.category && (item.manufacturer || item.model)) {
      if (isPdf) pdfBulk.mfrNoCategory += 1;
      else warnings.push(`Item ${sourceLabel} has manufacturer/model data but no category.`);
    }
    if (item.sourceType !== 'pdf' && !item.roomName && roomNames.size > 1) {
      missingRoomLabels.push(sourceLabel);
    }
    const bestCatalogCandidate = item.catalogMatchCandidates?.[0];
    if (item.rawHeader && (!bestCatalogCandidate || bestCatalogCandidate.matchMethod === 'unmatched')) {
      if (isPdf) pdfBulk.unmatchedCatalog += 1;
      else warnings.push(`Item ${sourceLabel} from header "${item.rawHeader}" could not be matched to the catalog.`);
    } else if (bestCatalogCandidate && bestCatalogCandidate.confidence < 0.75) {
      if (isPdf) pdfBulk.uncertainCatalog += 1;
      else warnings.push(`Item ${sourceLabel} has an uncertain catalog match (${bestCatalogCandidate.matchedName || item.rawHeader || item.description}).`);
    }

    const duplicateKey = [normalizeComparableText(item.roomName || ''), normalizeComparableText(item.description), item.quantity ?? '', (item.unit || '').toUpperCase()].join('|');
    if (seenKeys.has(duplicateKey)) duplicateKeys.add(duplicateKey);
    else seenKeys.add(duplicateKey);
  });

  if (pdfBulk.badUnit > 0) {
    warnings.push(`${pdfBulk.badUnit} PDF line(s) have an unrecognized unit; set EA/LF/SF etc. in review if needed.`);
  }
  if (pdfBulk.unitNoQty > 0) {
    warnings.push(`${pdfBulk.unitNoQty} PDF line(s) list a unit without a parsed quantity; confirm qty in review.`);
  }
  if (pdfBulk.modifierReclass > 0) {
    warnings.push(`${pdfBulk.modifierReclass} PDF line(s) were treated as modifiers (finish adds, etc.).`);
  }
  if (pdfBulk.roomHeaderMaybe > 0) {
    warnings.push(`${pdfBulk.roomHeaderMaybe} PDF line(s) may be room/area headers rather than scope quantities—uncheck or edit in review.`);
  }
  if (pdfBulk.mfrNoCategory > 0) {
    warnings.push(`${pdfBulk.mfrNoCategory} PDF line(s) have manufacturer/model text but no inferred category.`);
  }
  if (pdfBulk.unmatchedCatalog > 0) {
    warnings.push(
      `${pdfBulk.unmatchedCatalog} PDF line(s) did not match the catalog from spreadsheet-style headers (normal for Word/PDF exports); use catalog picker in the workspace.`
    );
  }
  if (pdfBulk.uncertainCatalog > 0) {
    warnings.push(`${pdfBulk.uncertainCatalog} PDF line(s) have low-confidence catalog suggestions—confirm or remap in review.`);
  }

  if (missingRoomLabels.length > 0) {
    const cap = 6;
    const sample = missingRoomLabels.slice(0, cap).join('; ');
    const more = missingRoomLabels.length > cap ? ` (+${missingRoomLabels.length - cap} more)` : '';
    warnings.push(
      `${missingRoomLabels.length} spreadsheet row(s) have no room while multiple rooms appear in the file. Examples: ${sample}${more}`
    );
  }

  const dupCount = duplicateKeys.size;
  const allPdfImport = correctedItems.length > 0 && correctedItems.every((item) => item.sourceType === 'pdf');
  const dupBulkThreshold = allPdfImport ? 4 : 20;
  if (dupCount > dupBulkThreshold) {
    warnings.push(
      `${dupCount} groups of near-duplicate lines were detected (often repeated PDF tokens). Review the grid and delete junk rows if needed.`
    );
  } else {
    duplicateKeys.forEach((key) => {
      warnings.push(`Possible duplicate parsed item detected (${key}).`);
    });
  }

  return {
    isValid: errors.length === 0,
    errors: Array.from(new Set(errors)),
    warnings: Array.from(new Set(warnings)),
    correctedItems,
  };
}