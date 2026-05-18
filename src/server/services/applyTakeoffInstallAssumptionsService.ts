import type { TakeoffLineRecord } from '../../shared/types/estimator.ts';
import type { LineFacts, ProjectAssumptions } from '../../shared/types/div10InstallIntelligence.ts';
import {
  parseLineInstallAssumptionsFromNotes,
  stripInstallIntelligenceMarkersFromNotes,
  upsertLineInstallAssumptionsInNotes,
} from '../../shared/utils/lineInstallAssumptions.ts';
import { buildProjectAssumptionsForInstall } from '../../shared/utils/projectBlockingAssumptions.ts';
import { readSourceRowTypeFromNotes } from '../../shared/utils/installIntelligenceLineUi.ts';
import { getCatalogItemById } from '../repos/catalogRepo.ts';
import { getProject } from '../repos/projectsRepo.ts';
import { recalculateLineFromModifiers } from '../repos/modifiersRepo.ts';
import { getTakeoffLineCore, updateTakeoffLine } from '../repos/takeoffRepo.ts';
import {
  getActiveInstallIntelligenceWorkbook,
  inferCategoryKey,
  resolveInstallIntelligenceFromWorkbook,
  warmInstallIntelligenceWorkbook,
} from './div10InstallIntelligenceService.ts';

export interface ApplyTakeoffInstallAssumptionsInput {
  lineId: string;
  lineAssumptions?: Record<string, string>;
  /** When true, line notes assumptions are replaced (used when saving project defaults). */
  replaceLineAssumptions?: boolean;
  recalculateLabor?: boolean;
}

function buildLineFacts(line: TakeoffLineRecord, assumptions: Record<string, string>, catalogMinutes: number): LineFacts {
  const workbook = getActiveInstallIntelligenceWorkbook();
  const description = String(line.description || '').trim();
  const category = line.category ?? null;
  return {
    description,
    category,
    categoryKey: inferCategoryKey({ description, category, workbook }),
    laborFamily: line.installLaborFamily ?? null,
    unit: line.unit || 'EA',
    qty: Number(line.qty) || 1,
    vendorName: null,
    sku: line.sku ?? null,
    rowType: readSourceRowTypeFromNotes(line.notes) || 'material',
    sourceType: line.sourceType || 'vendor_quote',
    catalogLaborMinutes: catalogMinutes,
    assumptions,
  };
}

function rebuildNotesWithIntelligence(
  baseNotes: string,
  intelligence: ReturnType<typeof resolveInstallIntelligenceFromWorkbook>,
): string {
  const parts = [
    stripInstallIntelligenceMarkersFromNotes(baseNotes),
    intelligence.requiredQuestions.length
      ? `Install questions: ${intelligence.requiredQuestions.map((q) => q.prompt).join('; ')}`
      : null,
    ...intelligence.reviewFlags.map((flag) => `Install review: ${flag}`),
    ...intelligence.internalNotes,
    ...intelligence.proposalClauses
      .filter((c) => !c.internalOnly && c.clientText)
      .map((c) => `Proposal clause: ${c.clientText}`),
    intelligence.needsReview ? 'Needs Review' : null,
    intelligence.blockAutoPriceLabor ? 'Auto-price labor blocked pending install assumptions.' : null,
  ]
    .filter(Boolean)
    .map((p) => String(p).trim())
    .filter(Boolean);
  return parts.join(' | ').trim();
}

export async function applyTakeoffInstallAssumptions(
  input: ApplyTakeoffInstallAssumptionsInput,
): Promise<TakeoffLineRecord | null> {
  const existing = await getTakeoffLineCore(input.lineId);
  if (!existing) return null;

  const project = await getProject(existing.projectId);
  if (!project) return null;

  await warmInstallIntelligenceWorkbook();

  const priorAssumptions = parseLineInstallAssumptionsFromNotes(existing.notes);
  const mergedAssumptions = input.replaceLineAssumptions
    ? { ...(input.lineAssumptions || {}) }
    : {
        ...priorAssumptions,
        ...(input.lineAssumptions || {}),
      };
  const cleanedNotes = stripInstallIntelligenceMarkersFromNotes(existing.notes);
  const notesWithAssumptions = upsertLineInstallAssumptionsInNotes(cleanedNotes, mergedAssumptions);

  let catalogMinutes = 0;
  if (existing.catalogItemId) {
    const catalogItem = await getCatalogItemById(existing.catalogItemId);
    catalogMinutes = Number(catalogItem?.baseLaborMinutes || 0);
  }

  const projectAssumptions: ProjectAssumptions = buildProjectAssumptionsForInstall({
    wallSubstrate: project.wallSubstrate,
    structuredAssumptions: project.structuredAssumptions,
  });

  const jobConditions = project.jobConditions;
  const intelligence = resolveInstallIntelligenceFromWorkbook(getActiveInstallIntelligenceWorkbook(), {
    lineFacts: buildLineFacts(existing, mergedAssumptions, catalogMinutes),
    projectAssumptions,
    suppressBrightenLaborForVendorService: jobConditions?.suppressAutoLaborForInstallServiceRows ?? true,
  });

  const nextNotes = rebuildNotesWithIntelligence(notesWithAssumptions, intelligence);

  const patch: Partial<TakeoffLineRecord> = {
    notes: nextNotes,
    installLaborFamily: intelligence.laborFamily ?? existing.installLaborFamily ?? null,
  };

  if (input.recalculateLabor !== false) {
    patch.laborMinutes = intelligence.laborMinutes;
    patch.generatedLaborMinutes = intelligence.generatedLaborMinutes;
    patch.laborOrigin = intelligence.laborOrigin;
  }

  const updated = await updateTakeoffLine(input.lineId, patch);
  if (!updated) return null;

  if (input.recalculateLabor !== false) {
    const recalculated = await recalculateLineFromModifiers(input.lineId);
    return recalculated || updated;
  }

  return updated;
}
