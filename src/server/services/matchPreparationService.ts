import { randomUUID } from 'crypto';
import type { CatalogItem } from '../../types.ts';
import type { BundleRecord, IntakeCatalogAutoApplyMode } from '../../shared/types/estimator.ts';
import type { IntakeReviewLine, IntakeRoomCandidate } from '../../shared/types/intake.ts';
import { computeCatalogAutoApplyTier } from '../../shared/utils/intakeAutomation.ts';
import { getIntakeCatalogMemoryBatch, intakeLineMemoryKeyFromFields } from '../repos/intakeCatalogMemoryRepo.ts';
import { prepareBundleMatch } from './intake/bundleIntakeMatching.ts';
import { detectBundleCandidates } from './intake/normalizer.ts';
import { prepareCatalogMatch } from './catalogMatchService.ts';
import { intakeAsText } from './metadataExtractorService.ts';
import { computeReviewLineContentKey, computeReviewLineFingerprint } from '../utils/reviewLineFingerprint.ts';
import type { NormalizedIntakeLine } from './spreadsheetInterpreterService.ts';
import { expandBundleLines } from './intake/bundleRowExpander.ts';
import { getInstallLaborFamily } from './intake/installLaborFamilies.ts';

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

export function finalizeIntakeReviewLines(
  reviewLines: IntakeReviewLine[],
  automation: { mode: IntakeCatalogAutoApplyMode; tierAMinScore: number }
): void {
  const min = Number.isFinite(automation.tierAMinScore) ? automation.tierAMinScore : 0.82;
  for (const line of reviewLines) {
    line.catalogAutoApplyTier = computeCatalogAutoApplyTier(line, min);
    line.catalogAutoLinked = false;
    if (automation.mode === 'auto_link_tier_a' && line.catalogAutoApplyTier === 'A' && line.catalogMatch) {
      line.matchStatus = 'matched';
      line.matchedCatalogItemId = line.catalogMatch.catalogItemId;
      line.catalogAutoLinked = true;
    }
  }
}

export async function toReviewLines(
  lines: NormalizedIntakeLine[],
  catalog: CatalogItem[],
  matchCatalog: boolean,
  bundles: BundleRecord[] = []
): Promise<IntakeReviewLine[]> {
  const useMemory = matchCatalog && catalog.length > 0;
  const catalogById = new Map(catalog.map((item) => [item.id, item] as const));
  const expandedLines = expandBundleLines(
    lines.map((line) => ({
      ...line,
      description: line.description || line.itemName || '',
      quantity: Number.isFinite(line.quantity) && Number(line.quantity) > 0 ? Number(line.quantity) : 1,
    }))
  ) as NormalizedIntakeLine[];
  const memKeys = useMemory
    ? expandedLines.map((line) => {
        const description = line.description || line.itemName;
        return intakeLineMemoryKeyFromFields({ itemCode: line.itemCode, itemName: line.itemName, description });
      })
    : [];
  const memoryByKey = useMemory ? await getIntakeCatalogMemoryBatch(memKeys) : new Map<string, string>();

  return expandedLines.map((line) => {
    const description = line.description || line.itemName;
    const seededMatch = line.catalogMatch || null;
    const seededSuggestion = line.suggestedMatch || null;
    const memKey = useMemory
      ? intakeLineMemoryKeyFromFields({ itemCode: line.itemCode, itemName: line.itemName, description })
      : '';
    const memoryCatalogItemId = useMemory && memKey ? memoryByKey.get(memKey) ?? null : null;
    const { catalogMatch, suggestedMatch } = seededMatch || seededSuggestion
      ? { catalogMatch: seededMatch, suggestedMatch: seededSuggestion }
      : matchCatalog
        ? prepareCatalogMatch(
            {
              itemCode: line.itemCode,
              itemName: line.itemName,
              description,
              category: line.category,
              notes: line.notes,
              unit: line.unit,
            },
            catalog,
            { memoryCatalogItemId: memoryCatalogItemId }
          )
        : { catalogMatch: null, suggestedMatch: null };

    const resolvedCategory = line.category || catalogMatch?.category || suggestedMatch?.category || '';
    const completeness = description && line.quantity > 0 && line.unit ? 'complete' : 'partial';
    const warnings = [...line.warnings];
    if (!resolvedCategory) warnings.push('Category could not be confidently inferred.');
    if (!catalogMatch && !suggestedMatch) warnings.push('No catalog match identified.');
    if (suggestedMatch && !catalogMatch) warnings.push('Catalog match is uncertain and should be reviewed before import.');
    const matchStatus = catalogMatch ? 'matched' : suggestedMatch ? 'suggested' : 'needs_match';
    const matchedCatalogItemId = catalogMatch?.catalogItemId ?? null;
    const unmatchedReason = warnings.find((warning) => /catalog coverage may be missing|no catalog candidate found/i.test(warning));
    const matchExplanation = catalogMatch?.reason || suggestedMatch?.reason || unmatchedReason || 'No confident catalog candidate was found.';

    const lineConfidencePenalty = line.reasoning?.confidence_adjustments?.lineConfidencePenalty ?? 0;
    let adjustedConfidence = Math.max(0.05, Math.min(1, Number((line.confidence - lineConfidencePenalty).toFixed(3))));
    const hiddenRisk = line.reasoning?.confidence_adjustments?.hiddenScopeRiskScore ?? 0;
    if (hiddenRisk > 45) {
      warnings.push('Bid reasoning: elevated hidden-scope / field-verify risk on this line.');
    }
    if (line.reasoning?.confidence_adjustments?.needsSpecCrosscheck) {
      warnings.push('Bid reasoning: spec cross-check suggested for this line.');
    }

    const bundleCandidates =
      line.bundleCandidates && line.bundleCandidates.length > 0
        ? line.bundleCandidates
        : detectBundleCandidates(description, resolvedCategory || line.category || null);

    const bundleInput = {
      roomName: normalizeRoomName(line.roomName),
      itemName: line.itemName || '',
      description,
      category: resolvedCategory || line.category || '',
      bundleCandidates,
    };
    const { bundleMatch, suggestedBundle } = bundles.length ? prepareBundleMatch(bundleInput, bundles) : { bundleMatch: null, suggestedBundle: null };
    if (bundleMatch) {
      warnings.push(`Room/scope aligns with catalog bundle “${bundleMatch.bundleName}” — apply bundle in workspace when this scope is a package.`);
    } else if (suggestedBundle) {
      warnings.push(`Possible catalog bundle: “${suggestedBundle.bundleName}” (${suggestedBundle.reason}).`);
    }

    const reviewLineFingerprint = computeReviewLineFingerprint({
      roomName: normalizeRoomName(line.roomName),
      itemCode: line.itemCode,
      itemName: line.itemName || description,
      description,
      quantity: line.quantity,
      unit: line.unit || 'EA',
    });
    const reviewLineContentKey = computeReviewLineContentKey({
      roomName: normalizeRoomName(line.roomName),
      itemCode: line.itemCode,
      itemName: line.itemName || description,
      description,
    });

    return {
      lineId: randomUUID(),
      reviewLineFingerprint,
      reviewLineContentKey,
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
      matchedCatalogItemId,
      matchExplanation,
      catalogMatch,
      suggestedMatch,
      bundleMatch,
      suggestedBundle,
      warnings: Array.from(new Set(warnings)),
      semanticTags: line.semanticTags,
      reasoning: line.reasoning,
      sourceManufacturer: line.sourceManufacturer || undefined,
      sourceBidBucket: line.sourceBidBucket || undefined,
      sourceSectionHeader: line.sourceSectionHeader || undefined,
      isInstallableScope: line.isInstallableScope ?? false,
      installScopeType: line.installScopeType ?? null,
      installFamilyFallback: buildInstallFamilyFallback(line, catalogMatch, catalogById),
    };
  });
}

/**
 * Install-family fallback fires whenever a line is installable AND the catalog path
 * did not produce real labor minutes. Preference order for the family key is:
 *   1. Matched catalog item's own `installLaborFamily` (editorial override)
 *   2. The line's `installScopeType` (parsed heuristic)
 * This closes the zero-labor gap — a catalog match with `baseLaborMinutes <= 0`
 * no longer suppresses install-family labor for an installable scope.
 */
function buildInstallFamilyFallback(
  line: NormalizedIntakeLine,
  catalogMatch: { catalogItemId?: string | null } | null,
  catalogById: Map<string, CatalogItem>
): { key: string; minutes: number; basis: string } | null {
  if (!line.isInstallableScope) return null;

  let catalogItem: CatalogItem | undefined;
  if (catalogMatch?.catalogItemId) {
    catalogItem = catalogById.get(catalogMatch.catalogItemId);
    const catalogLabor = Number(catalogItem?.baseLaborMinutes ?? 0);
    if (catalogLabor > 0) {
      // Real catalog labor exists — no fallback needed.
      return null;
    }
  }

  const catalogFamilyKey = catalogItem?.installLaborFamily?.trim() || null;
  const family =
    getInstallLaborFamily(catalogFamilyKey) ??
    getInstallLaborFamily(line.installScopeType || null);
  if (!family) return null;
  return {
    key: family.key,
    minutes: family.defaultInstallMinutes,
    basis: family.unitBasis,
  };
}