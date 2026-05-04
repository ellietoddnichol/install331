import test from 'node:test';
import assert from 'node:assert/strict';
import type { ProjectRecord, TakeoffLineRecord } from '../../shared/types/estimator.ts';
import {
  buildProjectConditionSummaryLines,
  createDefaultProjectJobConditions,
  normalizeProjectJobConditions,
} from '../../shared/utils/jobConditions.ts';
import { calculateEstimateSummary } from './estimateEngineV1.ts';
import { getConfiguredLaborRatePerHour } from '../repos/takeoffRepo.ts';

function buildProject(overrides: Partial<ProjectRecord> = {}): ProjectRecord {
  const base: ProjectRecord = {
    id: 'project-1',
    projectNumber: 'P-001',
    projectName: 'Union Baseline Test',
    clientName: 'Client',
    generalContractor: 'GC',
    estimator: 'Estimator',
    bidDate: '2026-03-19',
    proposalDate: '2026-03-19',
    dueDate: '2026-03-19',
    address: 'Kansas City, KS',
    projectType: null,
    projectSize: null,
    floorLevel: null,
    accessDifficulty: null,
    installHeight: null,
    materialHandling: null,
    wallSubstrate: null,
    laborBurdenPercent: 0,
    overheadPercent: 15,
    profitPercent: 10,
    laborOverheadPercent: 5,
    laborProfitPercent: 10,
    subLaborManagementFeeEnabled: false,
    subLaborManagementFeePercent: 5,
    taxPercent: 8.25,
    pricingMode: 'labor_and_material',
    selectedScopeCategories: [],
    jobConditions: createDefaultProjectJobConditions(),
    status: 'Draft',
    notes: null,
    specialNotes: null,
    proposalIncludeSpecialNotes: false,
    proposalIncludeCatalogImages: false,
    proposalFormat: 'standard',
    structuredAssumptions: [],
    createdAt: '2026-03-19T00:00:00.000Z',
    updatedAt: '2026-03-19T00:00:00.000Z',
  };
  return {
    ...base,
    ...overrides,
    jobConditions: normalizeProjectJobConditions({
      ...base.jobConditions,
      ...(overrides.jobConditions || {}),
    }),
  };
}

function buildLine(overrides: Partial<TakeoffLineRecord> = {}): TakeoffLineRecord {
  return {
    id: 'line-1',
    projectId: 'project-1',
    roomId: 'room-1',
    sourceType: 'catalog',
    sourceRef: null,
    description: 'Grab Bar 36 Stainless Steel',
    sku: 'GB-36',
    category: 'Toilet Accessories',
    subcategory: null,
    baseType: null,
    qty: 1,
    unit: 'EA',
    materialCost: 50,
    baseMaterialCost: 50,
    laborMinutes: 60,
    laborCost: 100,
    baseLaborCost: 100,
    pricingSource: 'auto',
    unitSell: 150,
    lineTotal: 150,
    notes: null,
    bundleId: null,
    catalogItemId: 'catalog-1',
    variantId: null,
    createdAt: '2026-03-19T00:00:00.000Z',
    updatedAt: '2026-03-19T00:00:00.000Z',
    ...overrides,
  };
}

test('new project job conditions use zero field-schedule pricing pads', () => {
  const j = createDefaultProjectJobConditions();
  assert.equal(j.materialWastePercent, 0);
  assert.equal(j.installerFieldSuppliesPercent, 0);
  assert.equal(j.laborLearningCurvePercent, 0);
  assert.equal(j.dailyBreakHoursPerInstaller, 0);
  assert.equal(j.fieldSetupCleanupHoursPerInstallerDay, 0);
});

test('union labor is baseline and does not surface as a modifier', () => {
  const project = buildProject();
  assert.equal(project.jobConditions.laborLearningCurvePercent, 0);
  const summary = calculateEstimateSummary(project, [buildLine()]);
  const conditionLines = buildProjectConditionSummaryLines(project.jobConditions);

  assert.equal(summary.totalLaborMinutes, 60);
  assert.equal(summary.conditionLaborMultiplier, 1);
  assert.equal(summary.projectConditions.unionLaborBaseline, true);
  assert.equal(summary.conditionAssumptions.some((line) => /union wage/i.test(line)), false);
  assert.equal(conditionLines.some((line) => /union wage/i.test(line)), false);
});

test('night work applies globally to labor totals and labor hours', () => {
  const project = buildProject({
    jobConditions: {
      ...createDefaultProjectJobConditions(),
      installerCount: 2,
      nightWork: true,
      nightWorkLaborCostMultiplier: 0.2,
      nightWorkLaborMinutesMultiplier: 0.1,
    },
  });
  const lines = [
    buildLine({ id: 'line-1', laborCost: 100, baseLaborCost: 100, laborMinutes: 60, unitSell: 150, lineTotal: 150 }),
    buildLine({
      id: 'line-2',
      description: 'Soap Dispenser',
      sku: 'SD-1',
      laborCost: 50,
      baseLaborCost: 50,
      laborMinutes: 30,
      materialCost: 25,
      baseMaterialCost: 25,
      unitSell: 75,
      lineTotal: 75,
    }),
  ];

  const summary = calculateEstimateSummary(project, lines);

  assert.equal(summary.laborSubtotal, 150);
  assert.equal(summary.adjustedLaborSubtotal, 180);
  assert.ok(Math.abs(summary.totalLaborHours - 1.65) < 1e-9);
  assert.ok(Math.abs(summary.totalLaborMinutes - 99) < 1e-6);
  assert.equal(summary.conditionLaborMultiplier, 1.2);
  assert.equal(summary.conditionLaborHoursMultiplier, 1.1);
  assert.equal(summary.projectConditions.nightWork, true);
  assert.equal(summary.conditionAssumptions.some((line) => /night work applies to all scoped items/i.test(line)), true);
  assert.ok(Math.abs(summary.laborLoadedSubtotal - 207.9) < 0.05);
  assert.ok(Math.abs(summary.materialLoadedSubtotal - 102.702) < 0.05);
  assert.ok(Math.abs(summary.baseBidTotal - 310.6) < 0.1);
  assert.equal(summary.productiveCrewHoursPerDay, 16);
});

test('install-only bid excludes material dollars and material tax even when lines carry material costs', () => {
  const project = buildProject({ pricingMode: 'labor_only', taxPercent: 8.25 });
  const summary = calculateEstimateSummary(project, [buildLine({ materialCost: 500, baseMaterialCost: 500 })]);
  assert.equal(summary.materialSubtotal, 0);
  assert.equal(summary.taxAmount, 0);
  assert.equal(summary.overheadAmount, 0);
  assert.equal(summary.profitAmount, 0);
  assert.equal(summary.materialLoadedSubtotal, 0);
  assert.ok(summary.laborLoadedSubtotal > 0);
  assert.equal(summary.baseBidTotal, summary.laborLoadedSubtotal);
});

test('material-only bid still builds labor companion dollars from minutes when unit labor cost is zero', () => {
  const project = buildProject({ pricingMode: 'material_only' });
  const rate = getConfiguredLaborRatePerHour();
  const line = buildLine({ laborCost: 0, baseLaborCost: 0, laborMinutes: 120, qty: 1, materialCost: 200 });
  const summary = calculateEstimateSummary(project, [line]);
  const expectedRaw = Number(((120 / 60) * rate).toFixed(2));
  assert.equal(summary.laborSubtotal, expectedRaw);
  assert.equal(summary.adjustedLaborSubtotal, 0);
  assert.ok(summary.laborCompanionProposalTotal > expectedRaw * 1.15);
  assert.ok(summary.baseBidTotal > 200);
});

test('material waste, field supplies, learning curve, and breaks do not change estimate pricing (breaks do reduce calendar capacity)', () => {
  const project = buildProject({
    jobConditions: {
      ...createDefaultProjectJobConditions(),
      materialWastePercent: 10,
      installerFieldSuppliesPercent: 5,
      installerFieldSuppliesFlat: 20,
      laborLearningCurvePercent: 20,
      installerCount: 1,
      dailyBreakHoursPerInstaller: 1,
      installerPaidDayHours: 8,
    },
  });
  const line = buildLine({
    materialCost: 100,
    qty: 1,
    laborMinutes: 60,
    laborCost: 0,
    baseLaborCost: 0,
    unitSell: 100,
    lineTotal: 100,
  });
  const summary = calculateEstimateSummary(project, [line]);
  assert.ok(Math.abs(summary.materialSubtotal - 100) < 0.05);
  assert.equal(summary.materialWasteAllowanceAmount, 0);
  assert.equal(summary.installerFieldSuppliesAmount, 0);
  assert.equal(summary.laborLearningCurveAllowanceAmount, 0);
  assert.equal(summary.conditionAssumptions.some((a) => /waste/i.test(a)), false);
  assert.equal(summary.conditionAssumptions.some((a) => /learning-curve/i.test(a)), false);
  assert.equal(summary.conditionAssumptions.some((a) => /breaks/i.test(a)), false);
  assert.equal(summary.productiveCrewHoursPerDay, 7);
});

test('field setup/cleanup time reduces install capacity per day for calendar duration', () => {
  const project = buildProject({
    jobConditions: {
      ...createDefaultProjectJobConditions(),
      installerCount: 2,
      installerPaidDayHours: 8,
      dailyBreakHoursPerInstaller: 0.5,
      fieldSetupCleanupHoursPerInstallerDay: 1,
    },
  });
  // 8 - 0.5 - 1 = 6.5 install hr per installer × 2 = 13 crew-hr / day
  const summary = calculateEstimateSummary(project, [buildLine({ laborMinutes: 60, laborCost: 100, baseLaborCost: 100, unitSell: 150, lineTotal: 150 })]);
  assert.ok(Math.abs(summary.productiveCrewHoursPerDay - 13) < 0.01);
});

test('zero travel distance does not appear in condition assumptions or proposal summary lines', () => {
  const project = buildProject({
    jobConditions: {
      ...createDefaultProjectJobConditions(),
      travelDistanceMiles: 0,
    },
  });
  const summary = calculateEstimateSummary(project, [buildLine()]);
  assert.equal(summary.conditionAssumptions.some((line) => /travel distance|distance from office/i.test(line)), false);
  const conditionLines = buildProjectConditionSummaryLines(project.jobConditions);
  assert.equal(conditionLines.some((line) => /travel distance|distance from office/i.test(line)), false);
});
