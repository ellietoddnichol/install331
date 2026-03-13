import { ProjectJobConditions, ProjectRecord } from '../types/estimator';
import { formatCurrencySafe, formatNumberSafe, formatPercentSafe } from '../../utils/numberFormat';

const DEFAULT_JOB_CONDITIONS: ProjectJobConditions = {
  locationLabel: '',
  locationTaxPercent: null,
  unionWage: false,
  unionWageMultiplier: 0.18,
  prevailingWage: false,
  prevailingWageMultiplier: 0.15,
  laborRateBasis: 'standard',
  laborRateMultiplier: 1,
  floors: 1,
  floorMultiplierPerFloor: 0.03,
  elevatorAvailable: true,
  occupiedBuilding: false,
  occupiedBuildingMultiplier: 0.08,
  restrictedAccess: false,
  restrictedAccessMultiplier: 0.1,
  afterHoursWork: false,
  afterHoursMultiplier: 0.12,
  phasedWork: false,
  phasedWorkMultiplier: 0.07,
  deliveryDifficulty: 'standard',
  deliveryRequired: false,
  deliveryPricingMode: 'included',
  deliveryValue: 0,
  smallJobFactor: false,
  smallJobMultiplier: 0.06,
  mobilizationComplexity: 'low',
  remoteTravel: false,
  remoteTravelMultiplier: 0.09,
  scheduleCompression: false,
  scheduleCompressionMultiplier: 0.1,
  estimateAdderPercent: 0,
  estimateAdderAmount: 0,
};

export function createDefaultProjectJobConditions(): ProjectJobConditions {
  return { ...DEFAULT_JOB_CONDITIONS };
}

export function normalizeProjectJobConditions(input?: Partial<ProjectJobConditions> | null): ProjectJobConditions {
  const merged = {
    ...DEFAULT_JOB_CONDITIONS,
    ...(input || {}),
  };

  const laborRateMultiplier = Number(merged.laborRateMultiplier);
  const floors = Number(merged.floors);
  const locationTaxPercent = merged.locationTaxPercent === null || merged.locationTaxPercent === undefined
    ? null
    : Number(merged.locationTaxPercent);
  const numeric = (value: unknown, fallback: number) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  };

  return {
    ...merged,
    laborRateMultiplier: Number.isFinite(laborRateMultiplier) && laborRateMultiplier > 0 ? laborRateMultiplier : 1,
    floors: Number.isFinite(floors) && floors > 0 ? Math.round(floors) : 1,
    locationTaxPercent: locationTaxPercent !== null && Number.isFinite(locationTaxPercent)
      ? locationTaxPercent
      : null,
    unionWageMultiplier: numeric(merged.unionWageMultiplier, DEFAULT_JOB_CONDITIONS.unionWageMultiplier),
    prevailingWageMultiplier: numeric(merged.prevailingWageMultiplier, DEFAULT_JOB_CONDITIONS.prevailingWageMultiplier),
    floorMultiplierPerFloor: numeric(merged.floorMultiplierPerFloor, DEFAULT_JOB_CONDITIONS.floorMultiplierPerFloor),
    occupiedBuildingMultiplier: numeric(merged.occupiedBuildingMultiplier, DEFAULT_JOB_CONDITIONS.occupiedBuildingMultiplier),
    restrictedAccessMultiplier: numeric(merged.restrictedAccessMultiplier, DEFAULT_JOB_CONDITIONS.restrictedAccessMultiplier),
    afterHoursMultiplier: numeric(merged.afterHoursMultiplier, DEFAULT_JOB_CONDITIONS.afterHoursMultiplier),
    phasedWorkMultiplier: numeric(merged.phasedWorkMultiplier, DEFAULT_JOB_CONDITIONS.phasedWorkMultiplier),
    deliveryValue: numeric(merged.deliveryValue, DEFAULT_JOB_CONDITIONS.deliveryValue),
    smallJobMultiplier: numeric(merged.smallJobMultiplier, DEFAULT_JOB_CONDITIONS.smallJobMultiplier),
    remoteTravelMultiplier: numeric(merged.remoteTravelMultiplier, DEFAULT_JOB_CONDITIONS.remoteTravelMultiplier),
    scheduleCompressionMultiplier: numeric(merged.scheduleCompressionMultiplier, DEFAULT_JOB_CONDITIONS.scheduleCompressionMultiplier),
    estimateAdderPercent: Number.isFinite(Number(merged.estimateAdderPercent)) ? Number(merged.estimateAdderPercent) : 0,
    estimateAdderAmount: Number.isFinite(Number(merged.estimateAdderAmount)) ? Number(merged.estimateAdderAmount) : 0,
  };
}

export interface ProjectConditionEffects {
  laborMultiplier: number;
  laborAdjustmentAmount: number;
  estimateAdderAmount: number;
  totalConditionAdjustment: number;
  taxPercentApplied: number;
  assumptions: string[];
}

function addMultiplierAdjustment(enabled: boolean, increment: number, laborMultiplier: number, assumptions: string[], label: string): number {
  if (!enabled || increment === 0) return laborMultiplier;
  assumptions.push(label);
  return laborMultiplier + increment;
}

export function computeProjectConditionEffects(
  project: ProjectRecord,
  laborSubtotal: number,
  materialSubtotal: number,
  baseLineSubtotal: number
): ProjectConditionEffects {
  const job = normalizeProjectJobConditions(project.jobConditions);
  let laborMultiplier = 1;
  let directAdjustmentAmount = 0;
  const assumptions: string[] = [];

  if (job.unionWage || job.laborRateBasis === 'union') {
    laborMultiplier = addMultiplierAdjustment(true, job.unionWageMultiplier, laborMultiplier, assumptions, `Union wage labor basis applied (x${formatNumberSafe(1 + job.unionWageMultiplier, 2)}).`);
  }

  if (job.prevailingWage || job.laborRateBasis === 'prevailing') {
    laborMultiplier = addMultiplierAdjustment(true, job.prevailingWageMultiplier, laborMultiplier, assumptions, `Prevailing wage labor basis applied (x${formatNumberSafe(1 + job.prevailingWageMultiplier, 2)}).`);
  }

  if (job.floors > 1) {
    const floorIncrement = (job.floors - 1) * job.floorMultiplierPerFloor;
    laborMultiplier = addMultiplierAdjustment(true, floorIncrement, laborMultiplier, assumptions, `Multi-floor execution adjustment (${job.floors} floors at ${formatPercentSafe(job.floorMultiplierPerFloor * 100)} per added floor).`);
  }

  if (job.floors > 3 && !job.elevatorAvailable) {
    laborMultiplier += 0.1;
    assumptions.push('No elevator access on multi-floor scope.');
  }

  if (job.occupiedBuilding) {
    laborMultiplier = addMultiplierAdjustment(true, job.occupiedBuildingMultiplier, laborMultiplier, assumptions, `Occupied building productivity impact applied (x${formatNumberSafe(1 + job.occupiedBuildingMultiplier, 2)}).`);
  }

  if (job.restrictedAccess) {
    laborMultiplier = addMultiplierAdjustment(true, job.restrictedAccessMultiplier, laborMultiplier, assumptions, `Restricted access labor multiplier applied (x${formatNumberSafe(1 + job.restrictedAccessMultiplier, 2)}).`);
  }

  if (job.afterHoursWork) {
    laborMultiplier = addMultiplierAdjustment(true, job.afterHoursMultiplier, laborMultiplier, assumptions, `After-hours labor condition applied (x${formatNumberSafe(1 + job.afterHoursMultiplier, 2)}).`);
  }

  if (job.phasedWork) {
    laborMultiplier = addMultiplierAdjustment(true, job.phasedWorkMultiplier, laborMultiplier, assumptions, `Phased execution labor condition applied (x${formatNumberSafe(1 + job.phasedWorkMultiplier, 2)}).`);
  }

  if (job.smallJobFactor) {
    laborMultiplier = addMultiplierAdjustment(true, job.smallJobMultiplier, laborMultiplier, assumptions, `Small job factor applied (x${formatNumberSafe(1 + job.smallJobMultiplier, 2)}).`);
  }

  if (job.remoteTravel) {
    laborMultiplier = addMultiplierAdjustment(true, job.remoteTravelMultiplier, laborMultiplier, assumptions, `Remote travel labor condition applied (x${formatNumberSafe(1 + job.remoteTravelMultiplier, 2)}).`);
  }

  if (job.scheduleCompression) {
    laborMultiplier = addMultiplierAdjustment(true, job.scheduleCompressionMultiplier, laborMultiplier, assumptions, `Schedule compression labor condition applied (x${formatNumberSafe(1 + job.scheduleCompressionMultiplier, 2)}).`);
  }

  if (job.deliveryDifficulty === 'constrained') {
    laborMultiplier += 0.05;
    assumptions.push('Constrained delivery condition applied.');
  }

  if (job.deliveryDifficulty === 'difficult') {
    laborMultiplier += 0.1;
    assumptions.push('Difficult delivery condition applied.');
  }

  if (job.mobilizationComplexity === 'medium') {
    laborMultiplier += 0.03;
    assumptions.push('Medium mobilization complexity applied.');
  }

  if (job.mobilizationComplexity === 'high') {
    laborMultiplier += 0.07;
    assumptions.push('High mobilization complexity applied.');
  }

  if (job.deliveryRequired) {
    if (job.deliveryPricingMode === 'flat' && job.deliveryValue !== 0) {
      directAdjustmentAmount += job.deliveryValue;
      assumptions.push(`Delivery allowance added as a flat amount (${formatCurrencySafe(job.deliveryValue)}).`);
    }

    if (job.deliveryPricingMode === 'percent' && job.deliveryValue !== 0) {
      const deliveryPercentAmount = baseLineSubtotal * (job.deliveryValue / 100);
      directAdjustmentAmount += deliveryPercentAmount;
      assumptions.push(`Delivery allowance added at ${formatPercentSafe(job.deliveryValue)} of base pricing.`);
    }

    if (job.deliveryPricingMode === 'included' || job.deliveryValue === 0) {
      assumptions.push('Delivery scope is included with no separate pricing adder.');
    }
  }

  laborMultiplier *= job.laborRateMultiplier;

  if (job.laborRateMultiplier !== 1) {
    assumptions.push(`Custom labor multiplier x${formatNumberSafe(job.laborRateMultiplier, 2)} applied.`);
  }

  if (job.locationLabel.trim()) {
    assumptions.push(`Location condition: ${job.locationLabel.trim()}.`);
  }

  const laborAdjustmentAmount = (laborSubtotal * laborMultiplier) - laborSubtotal;
  const percentAdderAmount = baseLineSubtotal * (job.estimateAdderPercent / 100);
  const estimateAdderAmount = percentAdderAmount + job.estimateAdderAmount + directAdjustmentAmount;
  const taxPercentApplied = job.locationTaxPercent ?? project.taxPercent;

  if (job.estimateAdderPercent !== 0) {
    assumptions.push(`Project condition adder (${formatPercentSafe(job.estimateAdderPercent)}) applied.`);
  }

  if (job.estimateAdderAmount !== 0) {
    assumptions.push(`Project condition lump sum adder (${formatCurrencySafe(job.estimateAdderAmount)}) applied.`);
  }

  if (job.locationTaxPercent !== null) {
    assumptions.push(`Location tax override (${formatPercentSafe(job.locationTaxPercent)}) applied.`);
  }

  if (materialSubtotal <= 0 && taxPercentApplied > 0) {
    assumptions.push('Material tax not applied because material pricing mode is disabled.');
  }

  return {
    laborMultiplier,
    laborAdjustmentAmount,
    estimateAdderAmount,
    totalConditionAdjustment: laborAdjustmentAmount + estimateAdderAmount,
    taxPercentApplied,
    assumptions,
  };
}

export function buildProjectConditionSummaryLines(jobConditions?: Partial<ProjectJobConditions> | null): string[] {
  const job = normalizeProjectJobConditions(jobConditions);
  const lines: string[] = [];

  if (job.unionWage) lines.push(`Union wage basis was included at x${formatNumberSafe(1 + job.unionWageMultiplier, 2)} labor.`);
  if (job.prevailingWage) lines.push(`Prevailing wage requirements were included at x${formatNumberSafe(1 + job.prevailingWageMultiplier, 2)} labor.`);
  if (job.afterHoursWork) lines.push(`After-hours work assumptions are included at x${formatNumberSafe(1 + job.afterHoursMultiplier, 2)} labor.`);
  if (job.phasedWork) lines.push(`Phased work sequencing assumptions are included at x${formatNumberSafe(1 + job.phasedWorkMultiplier, 2)} labor.`);
  if (job.occupiedBuilding) lines.push(`Occupied building coordination assumptions are included at x${formatNumberSafe(1 + job.occupiedBuildingMultiplier, 2)} labor.`);
  if (job.restrictedAccess) lines.push(`Restricted access productivity assumptions are included at x${formatNumberSafe(1 + job.restrictedAccessMultiplier, 2)} labor.`);
  if (job.remoteTravel) lines.push(`Remote travel and mobilization assumptions are included at x${formatNumberSafe(1 + job.remoteTravelMultiplier, 2)} labor.`);
  if (job.scheduleCompression) lines.push(`Schedule compression assumptions are included at x${formatNumberSafe(1 + job.scheduleCompressionMultiplier, 2)} labor.`);
  if (job.floors > 1) lines.push(`Multi-floor access assumptions were included (${job.floors} floors).`);
  if (job.deliveryRequired) {
    if (job.deliveryPricingMode === 'flat' && job.deliveryValue !== 0) lines.push(`Delivery was included as a flat allowance of ${formatCurrencySafe(job.deliveryValue)}.`);
    if (job.deliveryPricingMode === 'percent' && job.deliveryValue !== 0) lines.push(`Delivery was included as a ${formatPercentSafe(job.deliveryValue)} allowance.`);
    if (job.deliveryPricingMode === 'included' || job.deliveryValue === 0) lines.push('Delivery was included with no separate line-item allowance.');
  }
  if (job.estimateAdderPercent !== 0) lines.push(`Project-wide pricing adder of ${formatPercentSafe(job.estimateAdderPercent)} was included.`);
  if (job.estimateAdderAmount !== 0) lines.push(`Project-wide lump-sum adder of ${formatCurrencySafe(job.estimateAdderAmount)} was included.`);
  if (job.locationLabel.trim()) lines.push(`Location assumptions: ${job.locationLabel.trim()}.`);

  return lines;
}
