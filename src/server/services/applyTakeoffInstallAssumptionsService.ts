import type { ProjectRecord, TakeoffLineRecord } from '../../shared/types/estimator.ts';
import type { LineFacts, ProjectAssumptions } from '../../shared/types/div10InstallIntelligence.ts';
import {
  parseLineInstallAssumptionsFromNotes,
  stripInstallIntelligenceMarkersFromNotes,
  upsertLineInstallAssumptionsInNotes,
} from '../../shared/utils/lineInstallAssumptions.ts';
import { buildProjectAssumptionsForInstall } from '../../shared/utils/projectBlockingAssumptions.ts';
import { readSourceRowTypeFromNotes } from '../../shared/utils/installIntelligenceLineUi.ts';
import { normalizeProjectJobConditions } from '../../shared/utils/jobConditions.ts';
import { getCatalogItemById } from '../repos/catalogRepo.ts';
import { isSheetsDataBackend } from '../repos/dataBackend.ts';
import { getProject } from '../repos/projectsRepo.ts';
import { recalculateLineFromModifiers } from '../repos/modifiersRepo.ts';
import { getTakeoffLineCore, updateTakeoffLine } from '../repos/takeoffRepo.ts';
import { getEstimateLineFromSheets, updateEstimateLineInSheets } from '../repos/sheetsEstimateRepo.ts';
import { getProjectFromSheets } from '../repos/sheetsProjectsRepo.ts';
import { listCatalogItemsFromSheets } from '../repos/sheetsCatalogRepo.ts';
import { getSettingsFromSheets } from '../repos/sheetsSettingsRepo.ts';
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

export type SheetsInstallAssumptionsDeps = {
  getLine: (lineId: string) => Promise<TakeoffLineRecord | null>;
  updateLine: (lineId: string, patch: Partial<TakeoffLineRecord>) => Promise<TakeoffLineRecord | null>;
  getProject: (projectId: string) => Promise<ProjectRecord | null>;
  catalogLaborMinutes: (catalogItemId: string | null | undefined) => Promise<number>;
  laborRatePerHour: (project: ProjectRecord) => Promise<number>;
};

let sheetsInstallAssumptionsDepsOverride: SheetsInstallAssumptionsDeps | null = null;

/** Test hook: inject in-memory Sheets estimate/project deps. */
export function __setSheetsInstallAssumptionsDepsForTests(deps: SheetsInstallAssumptionsDeps | null): void {
  sheetsInstallAssumptionsDepsOverride = deps;
}

function defaultSheetsInstallAssumptionsDeps(): SheetsInstallAssumptionsDeps {
  return {
    getLine: getEstimateLineFromSheets,
    updateLine: updateEstimateLineInSheets,
    getProject: getProjectFromSheets,
    catalogLaborMinutes: async (catalogItemId) => {
      if (!catalogItemId) return 0;
      const items = await listCatalogItemsFromSheets();
      const item = items.find((row) => row.id === catalogItemId);
      return Number(item?.baseLaborMinutes || 0);
    },
    laborRatePerHour: async (project) => {
      const settings = await getSettingsFromSheets();
      const jobConditions = normalizeProjectJobConditions(project.jobConditions);
      return Number(
        (Number(settings.defaultLaborRatePerHour || 100) * Number(jobConditions.laborRateMultiplier || 1)).toFixed(2),
      );
    },
  };
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

function mergeLineAssumptions(
  existing: TakeoffLineRecord,
  input: ApplyTakeoffInstallAssumptionsInput,
): Record<string, string> {
  const priorAssumptions = parseLineInstallAssumptionsFromNotes(existing.notes);
  return input.replaceLineAssumptions
    ? { ...(input.lineAssumptions || {}) }
    : {
        ...priorAssumptions,
        ...(input.lineAssumptions || {}),
      };
}

export async function applyTakeoffInstallAssumptionsInSheets(
  input: ApplyTakeoffInstallAssumptionsInput,
  deps: SheetsInstallAssumptionsDeps = sheetsInstallAssumptionsDepsOverride ?? defaultSheetsInstallAssumptionsDeps(),
  options?: { skipWarmWorkbook?: boolean },
): Promise<TakeoffLineRecord | null> {
  const existing = await deps.getLine(input.lineId);
  if (!existing) return null;

  const project = await deps.getProject(existing.projectId);
  if (!project) return null;

  if (!options?.skipWarmWorkbook) {
    await warmInstallIntelligenceWorkbook();
  }

  const mergedAssumptions = mergeLineAssumptions(existing, input);
  const cleanedNotes = stripInstallIntelligenceMarkersFromNotes(existing.notes);
  const notesWithAssumptions = upsertLineInstallAssumptionsInNotes(cleanedNotes, mergedAssumptions);

  const catalogMinutes = await deps.catalogLaborMinutes(existing.catalogItemId);

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
    const laborMinutes = intelligence.laborMinutes;
    patch.laborMinutes = laborMinutes;
    patch.generatedLaborMinutes = intelligence.generatedLaborMinutes;
    patch.laborOrigin = intelligence.laborOrigin;

    const laborRatePerHour = await deps.laborRatePerHour(project);
    const laborCost = Number(((laborMinutes / 60) * laborRatePerHour).toFixed(2));
    patch.laborCost = laborCost;
    patch.baseLaborCost = laborCost;
    const unitSell = Number((existing.materialCost + laborCost).toFixed(2));
    patch.unitSell = unitSell;
    patch.lineTotal = Number((unitSell * existing.qty).toFixed(2));
  }

  return deps.updateLine(input.lineId, patch);
}

export async function applyTakeoffInstallAssumptions(
  input: ApplyTakeoffInstallAssumptionsInput,
): Promise<TakeoffLineRecord | null> {
  if (isSheetsDataBackend()) {
    return applyTakeoffInstallAssumptionsInSheets(input);
  }

  const existing = await getTakeoffLineCore(input.lineId);
  if (!existing) return null;

  const project = await getProject(existing.projectId);
  if (!project) return null;

  await warmInstallIntelligenceWorkbook();

  const mergedAssumptions = mergeLineAssumptions(existing, input);
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
