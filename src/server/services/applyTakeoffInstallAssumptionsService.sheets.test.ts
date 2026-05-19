import test from 'node:test';
import assert from 'node:assert/strict';
import type { ProjectRecord, ProjectStructuredAssumption, TakeoffLineRecord } from '../../shared/types/estimator.ts';
import { parseLineInstallAssumptionsFromNotes } from '../../shared/utils/lineInstallAssumptions.ts';
import { buildFallbackInstallIntelligenceWorkbook } from './div10InstallIntelligenceFallback.ts';
import { setActiveInstallIntelligenceWorkbookForTests } from './div10InstallIntelligenceService.ts';
import {
  __setSheetsInstallAssumptionsDepsForTests,
  applyTakeoffInstallAssumptionsInSheets,
  type SheetsInstallAssumptionsDeps,
} from './applyTakeoffInstallAssumptionsService.ts';

const wb = buildFallbackInstallIntelligenceWorkbook();

test.before(() => {
  setActiveInstallIntelligenceWorkbookForTests(wb);
});

test.after(() => {
  __setSheetsInstallAssumptionsDepsForTests(null);
});

function grabBarLine(overrides: Partial<TakeoffLineRecord> = {}): TakeoffLineRecord {
  const now = new Date().toISOString();
  return {
    id: 'line-grab-1',
    projectId: 'proj-1',
    roomId: 'general',
    sourceType: 'vendor_quote',
    sourceRef: 'quote-line-1',
    description: 'Bobrick grab bar 36 inch',
    sku: 'B-6806',
    category: 'Grab Bar',
    subcategory: null,
    baseType: null,
    qty: 1,
    unit: 'EA',
    taxable: true,
    materialCost: 120,
    baseMaterialCost: 120,
    laborMinutes: 0,
    laborCost: 0,
    baseLaborCost: 0,
    pricingSource: 'manual',
    unitSell: 120,
    lineTotal: 120,
    notes:
      'Source row type: material | Auto-price labor blocked pending install assumptions. | Install review: blocking_unknown',
    bundleId: null,
    catalogItemId: null,
    variantId: null,
    modifierNames: [],
    proposalVisibility: 'customer_visible',
    sourceLineType: 'source_line',
    sourceManufacturer: 'Bobrick',
    sourceBidBucket: null,
    sourceSectionHeader: null,
    isInstallableScope: true,
    installScopeType: null,
    installLaborFamily: 'grab_bar_install',
    sourceMaterialCost: 120,
    generatedLaborMinutes: null,
    laborOrigin: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function structuredAssumption(ruleId: string, text: string): ProjectStructuredAssumption {
  return {
    id: `sa-${ruleId}`,
    source: 'manual',
    ruleId,
    text,
    confidence: 1,
    createdAt: new Date().toISOString(),
  };
}

function projectWithBlockingUnknown(): ProjectRecord {
  const now = new Date().toISOString();
  return {
    id: 'proj-1',
    projectNumber: null,
    projectName: 'Smoke Project',
    clientName: null,
    generalContractor: null,
    estimator: null,
    bidDate: null,
    proposalDate: null,
    dueDate: null,
    address: null,
    projectType: null,
    projectSize: null,
    floorLevel: null,
    accessDifficulty: null,
    installHeight: null,
    materialHandling: null,
    wallSubstrate: 'drywall',
    laborBurdenPercent: 0,
    overheadPercent: 0,
    profitPercent: 0,
    laborOverheadPercent: 0,
    laborProfitPercent: 0,
    subLaborManagementFeeEnabled: false,
    subLaborManagementFeePercent: 0,
    taxPercent: 0,
    pricingMode: 'labor_and_material',
    selectedScopeCategories: [],
    preferredBrands: [],
    jobConditions: {
      suppressAutoLaborForInstallServiceRows: true,
      laborRateMultiplier: 1,
    } as ProjectRecord['jobConditions'],
    status: 'Draft',
    notes: null,
    specialNotes: null,
    proposalIncludeSpecialNotes: false,
    proposalIncludeCatalogImages: false,
    proposalFormat: 'standard',
    structuredAssumptions: [structuredAssumption('blocking_status', 'unknown')],
    createdAt: now,
    updatedAt: now,
  };
}

function inMemoryDeps(lines: TakeoffLineRecord[], projects: ProjectRecord[]): SheetsInstallAssumptionsDeps {
  const lineStore = new Map(lines.map((line) => [line.id, { ...line }]));
  const projectStore = new Map(projects.map((project) => [project.id, { ...project }]));
  return {
    getLine: async (lineId) => lineStore.get(lineId) ?? null,
    updateLine: async (lineId, patch) => {
      const current = lineStore.get(lineId);
      if (!current) return null;
      const next = { ...current, ...patch, id: lineId, updatedAt: new Date().toISOString() };
      lineStore.set(lineId, next);
      return next;
    },
    getProject: async (projectId) => projectStore.get(projectId) ?? null,
    catalogLaborMinutes: async () => 0,
    laborRatePerHour: async () => 125,
  };
}

test('Sheets line-level blocking included unlocks labor and serializes assumptions', async () => {
  const line = grabBarLine();
  const deps = inMemoryDeps([line], [projectWithBlockingUnknown()]);
  __setSheetsInstallAssumptionsDepsForTests(deps);

  const updated = await applyTakeoffInstallAssumptionsInSheets(
    {
      lineId: line.id,
      lineAssumptions: { blocking_status: 'included' },
      recalculateLabor: true,
    },
    deps,
    { skipWarmWorkbook: true },
  );

  assert.ok(updated);
  assert.ok((updated?.laborMinutes ?? 0) > 0);
  assert.equal(parseLineInstallAssumptionsFromNotes(updated?.notes).blocking_status, 'included');
  assert.doesNotMatch(String(updated?.notes || ''), /blocking_unknown/);
  assert.doesNotMatch(String(updated?.notes || ''), /Auto-price labor blocked/i);
});

test('Sheets line override wins over project blocking unknown', async () => {
  const line = grabBarLine({
    notes: 'Source row type: material | Install assumptions: blocking_status=unknown',
  });
  const deps = inMemoryDeps([line], [projectWithBlockingUnknown()]);
  __setSheetsInstallAssumptionsDepsForTests(deps);

  const blocked = await applyTakeoffInstallAssumptionsInSheets(
    { lineId: line.id, recalculateLabor: true },
    deps,
    { skipWarmWorkbook: true },
  );
  assert.equal(blocked?.laborMinutes, 0);

  const updated = await applyTakeoffInstallAssumptionsInSheets(
    {
      lineId: line.id,
      lineAssumptions: { blocking_status: 'included' },
      recalculateLabor: true,
    },
    deps,
    { skipWarmWorkbook: true },
  );
  assert.ok((updated?.laborMinutes ?? 0) > 0);
});

test('Sheets project-default replace clears line overrides and uses project assumptions', async () => {
  const line = grabBarLine({
    notes: 'Source row type: material | Install assumptions: blocking_status=unknown',
  });
  const project = {
    ...projectWithBlockingUnknown(),
    structuredAssumptions: [structuredAssumption('blocking_status', 'included')],
  };
  const deps = inMemoryDeps([line], [project]);
  __setSheetsInstallAssumptionsDepsForTests(deps);

  const updated = await applyTakeoffInstallAssumptionsInSheets(
    {
      lineId: line.id,
      replaceLineAssumptions: true,
      lineAssumptions: {},
      recalculateLabor: true,
    },
    deps,
    { skipWarmWorkbook: true },
  );

  assert.ok((updated?.laborMinutes ?? 0) > 0);
  assert.equal(parseLineInstallAssumptionsFromNotes(updated?.notes).blocking_status, undefined);
});

test('Sheets apply does not require SQLite takeoff tables', async () => {
  const line = grabBarLine();
  const deps = inMemoryDeps([line], [projectWithBlockingUnknown()]);
  __setSheetsInstallAssumptionsDepsForTests(deps);

  const { dbAll } = await import('../db/query.ts');
  const before = await dbAll('SELECT id FROM project_files_v1 LIMIT 1', []);

  const updated = await applyTakeoffInstallAssumptionsInSheets(
    {
      lineId: line.id,
      lineAssumptions: { blocking_status: 'included' },
      recalculateLabor: true,
    },
    deps,
    { skipWarmWorkbook: true },
  );

  assert.ok(updated);
  const afterTakeoff = await dbAll('SELECT id FROM takeoff_lines_v1 WHERE id = ?', [line.id]).catch(() => []);
  assert.equal(afterTakeoff.length, 0);
  assert.equal(before.length, before.length);
});
