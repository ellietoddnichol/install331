import { randomUUID } from 'crypto';
import type { CatalogItem } from '../../types.ts';
import type { IntakeReviewLine, IntakeRoomCandidate } from '../../shared/types/intake.ts';
import { prepareCatalogMatch } from './catalogMatchService.ts';
import { intakeAsText } from './metadataExtractorService.ts';
import type { NormalizedIntakeLine } from './spreadsheetInterpreterService.ts';

function normalizeRoomName(value: unknown): string {
  return intakeAsText(value) || 'General';
}

export function buildRoomCandidates(lines: IntakeReviewLine[]): IntakeRoomCandidate[] {
  const counts = new Map<string, { lineCount: number; confidenceSum: number; sourceReference: string }>();
  lines.forEach((line) => {
    const roomName = normalizeRoomName(line.roomName);
    const current = counts.get(roomName) || { lineCount: 0, confidenceSum: 0, sourceReference: line.sourceReference };
    current.lineCount += 1;
    current.confidenceSum += line.confidence;
    current.sourceReference = current.sourceReference || line.sourceReference;
    counts.set(roomName, current);
  });

  return Array.from(counts.entries())
    .map(([roomName, entry]) => ({
      roomName,
      sourceReference: entry.sourceReference,
      lineCount: entry.lineCount,
      confidence: Number((entry.confidenceSum / Math.max(1, entry.lineCount)).toFixed(2)),
    }))
    .sort((left, right) => right.lineCount - left.lineCount || left.roomName.localeCompare(right.roomName));
}

export function toReviewLines(lines: NormalizedIntakeLine[], catalog: CatalogItem[], matchCatalog: boolean): IntakeReviewLine[] {
  return lines.map((line) => {
    const description = line.description || line.itemName;
    const seededMatch = line.catalogMatch || null;
    const seededSuggestion = line.suggestedMatch || null;
    const { catalogMatch, suggestedMatch } = seededMatch || seededSuggestion
      ? { catalogMatch: seededMatch, suggestedMatch: seededSuggestion }
      : matchCatalog
        ? prepareCatalogMatch({
            itemCode: line.itemCode,
            itemName: line.itemName,
            description,
            category: line.category,
            notes: line.notes,
            unit: line.unit,
          }, catalog)
        : { catalogMatch: null, suggestedMatch: null };

    const resolvedCategory = line.category || catalogMatch?.category || suggestedMatch?.category || '';
    const completeness = description && line.quantity > 0 && line.unit ? 'complete' : 'partial';
    const warnings = [...line.warnings];
    if (!resolvedCategory) warnings.push('Category could not be confidently inferred.');
    if (!catalogMatch && !suggestedMatch) warnings.push('No catalog match identified.');
    if (suggestedMatch && !catalogMatch) warnings.push('Catalog match is uncertain and should be reviewed before import.');
    const matchStatus = catalogMatch ? 'matched' : suggestedMatch ? 'suggested' : 'needs_match';
    const unmatchedReason = warnings.find((warning) => /catalog coverage may be missing|no catalog candidate found/i.test(warning));
    const matchExplanation = catalogMatch?.reason || suggestedMatch?.reason || unmatchedReason || 'No confident catalog candidate was found.';

    return {
      lineId: randomUUID(),
      roomName: normalizeRoomName(line.roomName),
      itemName: line.itemName || description,
      description,
      category: resolvedCategory,
      itemCode: line.itemCode,
      quantity: line.quantity,
      unit: line.unit || 'EA',
      notes: line.notes,
      sourceReference: line.sourceReference,
      laborIncluded: line.laborIncluded,
      materialIncluded: line.materialIncluded,
      confidence: Number(line.confidence.toFixed(2)),
      completeness,
      matchStatus,
      matchedCatalogItemId: catalogMatch?.catalogItemId || suggestedMatch?.catalogItemId || null,
      matchExplanation,
      catalogMatch,
      suggestedMatch,
      warnings: Array.from(new Set(warnings)),
    };
  });
}