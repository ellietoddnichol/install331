import { GlobalModifierImpact, ProjectConditions, ProjectJobConditions, ProjectRecord } from '../types/estimator';
import { formatCurrencySafe, formatNumberSafe, formatPercentSafe } from '../../utils/numberFormat';

const DEFAULT_JOB_CONDITIONS: ProjectJobConditions = {
  locationLabel: '',
  travelDistanceMiles: null,
  installerCount: 1,
  locationTaxPercent: null,
  unionWage: false,
  unionWageMultiplier: 0,
  prevailingWage: false,
  prevailingWageMultiplier: 0.15,
  laborRateBasis: 'union',
  laborRateMultiplier: 1,
  floors: 1,
  floorMultiplierPerFloor: 0.03,
  elevatorAvailable: true,
  occupiedBuilding: false,
  occupiedBuildingMultiplier: 0.08,
  restrictedAccess: false,
  restrictedAccessMultiplier: 0.1,
  afterHoursWork: false,
  afterHoursMultiplier: 0,
  nightWork: false,
  nightWorkLaborCostMultiplier: 0.18,
  nightWorkLaborMinutesMultiplier: 0.12,
  phasedWork: false,
  phasedWorkPhases: 2,
  phasedWorkMultiplier: 0.07,
  deliveryDifficulty: 'standard',
  deliveryRequired: false,
  deliveryPricingMode: 'included',
  deliveryValue: 0,
  deliveryLeadDays: 0,
  deliveryAutoCalculated: true,
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
  const travelDistanceMiles = merged.travelDistanceMiles === null || merged.travelDistanceMiles === undefined
    ? null
    : Number(merged.travelDistanceMiles);
  const installerCount = Number(merged.installerCount);
  const phasedWorkPhases = Number(merged.phasedWorkPhases);
  const deliveryLeadDays = Number(merged.deliveryLeadDays);
  const nightWork = Boolean((merged as Partial<ProjectJobConditions>).nightWork ?? merged.afterHoursWork);
  const prevailingWage = Boolean(merged.prevailingWage || merged.laborRateBasis === 'prevailing');
  const numeric = (value: unknown, fallback: number) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  };

  return {
    ...merged,
    unionWage: false,
    prevailingWage,
    laborRateBasis: prevailingWage ? 'prevailing' : 'union',
    laborRateMultiplier: Number.isFinite(laborRateMultiplier) && laborRateMultiplier > 0 ? laborRateMultiplier : 1,
    floors: Number.isFinite(floors) && floors > 0 ? Math.round(floors) : 1,
    installerCount: Number.isFinite(installerCount) && installerCount > 0 ? Math.round(installerCount) : 1,
    phasedWorkPhases: Number.isFinite(phasedWorkPhases) && phasedWorkPhases > 1 ? Math.round(phasedWorkPhases) : 1,
    travelDistanceMiles: travelDistanceMiles !== null && Number.isFinite(travelDistanceMiles) && travelDistanceMiles >= 0
      ? Number(travelDistanceMiles.toFixed(1))
      : null,
    locationTaxPercent: locationTaxPercent !== null && Number.isFinite(locationTaxPercent)
      ? locationTaxPercent
      : null,
    unionWageMultiplier: 0,
    prevailingWageMultiplier: numeric(merged.prevailingWageMultiplier, DEFAULT_JOB_CONDITIONS.prevailingWageMultiplier),
    floorMultiplierPerFloor: numeric(merged.floorMultiplierPerFloor, DEFAULT_JOB_CONDITIONS.floorMultiplierPerFloor),
    occupiedBuildingMultiplier: numeric(merged.occupiedBuildingMultiplier, DEFAULT_JOB_CONDITIONS.occupiedBuildingMultiplier),
    restrictedAccessMultiplier: numeric(merged.restrictedAccessMultiplier, DEFAULT_JOB_CONDITIONS.restrictedAccessMultiplier),
    afterHoursWork: false,
    afterHoursMultiplier: 0,
    nightWork,
    nightWorkLaborCostMultiplier: numeric(
      (merged as Partial<ProjectJobConditions>).nightWorkLaborCostMultiplier ?? merged.afterHoursMultiplier,
      DEFAULT_JOB_CONDITIONS.nightWorkLaborCostMultiplier
    ),
    nightWorkLaborMinutesMultiplier: numeric(
      (merged as Partial<ProjectJobConditions>).nightWorkLaborMinutesMultiplier,
      DEFAULT_JOB_CONDITIONS.nightWorkLaborMinutesMultiplier
    ),
    phasedWorkMultiplier: numeric(merged.phasedWorkMultiplier, DEFAULT_JOB_CONDITIONS.phasedWorkMultiplier),
    deliveryValue: numeric(merged.deliveryValue, DEFAULT_JOB_CONDITIONS.deliveryValue),
    deliveryLeadDays: Number.isFinite(deliveryLeadDays) && deliveryLeadDays >= 0 ? Math.round(deliveryLeadDays) : 0,
    smallJobMultiplier: numeric(merged.smallJobMultiplier, DEFAULT_JOB_CONDITIONS.smallJobMultiplier),
    remoteTravelMultiplier: numeric(merged.remoteTravelMultiplier, DEFAULT_JOB_CONDITIONS.remoteTravelMultiplier),
    scheduleCompressionMultiplier: numeric(merged.scheduleCompressionMultiplier, DEFAULT_JOB_CONDITIONS.scheduleCompressionMultiplier),
    estimateAdderPercent: Number.isFinite(Number(merged.estimateAdderPercent)) ? Number(merged.estimateAdderPercent) : 0,
    estimateAdderAmount: Number.isFinite(Number(merged.estimateAdderAmount)) ? Number(merged.estimateAdderAmount) : 0,
  };
}

export function recommendedPhasedWorkMultiplier(phaseCount: number): number {
  const normalizedPhaseCount = Number.isFinite(phaseCount) && phaseCount > 1 ? Math.round(phaseCount) : 1;
  return Number((Math.max(0, normalizedPhaseCount - 1) * 0.07).toFixed(2));
}

export function recommendDeliveryPlan(distanceMiles: number | null | undefined, difficulty: ProjectJobConditions['deliveryDifficulty'] = 'standard') {
  if (distanceMiles === null || distanceMiles === undefined || !Number.isFinite(distanceMiles) || distanceMiles < 0) {
    return {
      deliveryRequired: false,
      deliveryPricingMode: 'included' as const,
      deliveryValue: 0,
      deliveryLeadDays: 0,
    };
  }

  const baseFee = 185;
  const mileageFee = Math.max(0, distanceMiles) * 2.35;
  let difficultyMultiplier = 1;
  let leadDayOffset = 0;

  if (difficulty === 'constrained') {
    difficultyMultiplier = 1.15;
    leadDayOffset = 1;
  }

  if (difficulty === 'difficult') {
    difficultyMultiplier = 1.3;
    leadDayOffset = 2;
  }

  const deliveryValue = Number(((baseFee + mileageFee) * difficultyMultiplier).toFixed(2));
  const distanceLeadDays = distanceMiles <= 25 ? 1 : distanceMiles <= 60 ? 2 : distanceMiles <= 120 ? 3 : distanceMiles <= 250 ? 5 : 7;

  return {
    deliveryRequired: true,
    deliveryPricingMode: 'flat' as const,
    deliveryValue,
    deliveryLeadDays: distanceLeadDays + leadDayOffset,
  };
}

export interface ProjectConditionEffects {
  laborCostMultiplier: number;
  laborHoursMultiplier: number;
  laborAdjustmentAmount: number;
  estimateAdderAmount: number;
  totalConditionAdjustment: number;
  taxPercentApplied: number;
  assumptions: string[];
  projectConditions: ProjectConditions;
}

function addSharedMultiplierAdjustment(enabled: boolean, increment: number, multipliers: { cost: number; hours: number }, assumptions: string[], label: string) {
  if (!enabled || increment === 0) return multipliers;
  assumptions.push(label);
  return {
    cost: multipliers.cost + increment,
    hours: multipliers.hours + increment,
  };
}

function addGlobalModifierImpact(enabled: boolean, impact: GlobalModifierImpact, multipliers: { cost: number; hours: number }, assumptions: string[], fallbackLabel: string) {
  if (!enabled) return multipliers;

  const costIncrement = Number(impact.laborCostMultiplier || 0);
  const hoursIncrement = Number(impact.laborMinutesMultiplier || 0);
  if (costIncrement === 0 && hoursIncrement === 0) return multipliers;

  const notes = Array.isArray(impact.notes) ? impact.notes.filter(Boolean) : [];
  assumptions.push(...(notes.length ? notes : [fallbackLabel]));

  return {
    cost: multipliers.cost + costIncrement,
    hours: multipliers.hours + hoursIncrement,
  };
}

export function getProjectConditions(jobConditions?: Partial<ProjectJobConditions> | null): ProjectConditions {
  const job = normalizeProjectJobConditions(jobConditions);
  return {
    unionLaborBaseline: true,
    nightWork: job.nightWork,
  };
}

export function getGlobalModifierImpact(jobConditions?: Partial<ProjectJobConditions> | null): GlobalModifierImpact {
  const job = normalizeProjectJobConditions(jobConditions);
  if (!job.nightWork) return {};

  const notes: string[] = [];
  if (job.nightWorkLaborCostMultiplier !== 0 && job.nightWorkLaborMinutesMultiplier !== 0) {
    notes.push(`Night work applies to all scoped items (labor cost x${formatNumberSafe(1 + job.nightWorkLaborCostMultiplier, 2)}, labor hours x${formatNumberSafe(1 + job.nightWorkLaborMinutesMultiplier, 2)}).`);
  } else if (job.nightWorkLaborCostMultiplier !== 0) {
    notes.push(`Night work applies to all scoped items (labor cost x${formatNumberSafe(1 + job.nightWorkLaborCostMultiplier, 2)}).`);
  } else if (job.nightWorkLaborMinutesMultiplier !== 0) {
    notes.push(`Night work applies to all scoped items (labor hours x${formatNumberSafe(1 + job.nightWorkLaborMinutesMultiplier, 2)}).`);
  }

  return {
    laborCostMultiplier: job.nightWorkLaborCostMultiplier,
    laborMinutesMultiplier: job.nightWorkLaborMinutesMultiplier,
    notes,
  };
}

export function computeProjectConditionEffects(
  project: ProjectRecord,
  laborSubtotal: number,
  materialSubtotal: number,
  baseLineSubtotal: number
): ProjectConditionEffects {
  const job = normalizeProjectJobConditions(project.jobConditions);
  const projectConditions = getProjectConditions(job);
  let multipliers = { cost: 1, hours: 1 };
  let directAdjustmentAmount = 0;
  const assumptions: string[] = [];

  if (job.prevailingWage || job.laborRateBasis === 'prevailing') {
    multipliers = addSharedMultiplierAdjustment(true, job.prevailingWageMultiplier, multipliers, assumptions, `Prevailing wage labor premium applied (x${formatNumberSafe(1 + job.prevailingWageMultiplier, 2)}).`);
  }

  if (job.floors > 1) {
    const floorIncrement = (job.floors - 1) * job.floorMultiplierPerFloor;
    multipliers = addSharedMultiplierAdjustment(true, floorIncrement, multipliers, assumptions, `Multi-floor execution adjustment (${job.floors} floors at ${formatPercentSafe(job.floorMultiplierPerFloor * 100)} per added floor).`);
  }

  if (job.floors > 3 && !job.elevatorAvailable) {
    multipliers.cost += 0.1;
    multipliers.hours += 0.1;
    assumptions.push('No elevator access on multi-floor scope.');
  }

  if (job.occupiedBuilding) {
    multipliers = addSharedMultiplierAdjustment(true, job.occupiedBuildingMultiplier, multipliers, assumptions, `Occupied building productivity impact applied (x${formatNumberSafe(1 + job.occupiedBuildingMultiplier, 2)}).`);
  }

  if (job.restrictedAccess) {
    multipliers = addSharedMultiplierAdjustment(true, job.restrictedAccessMultiplier, multipliers, assumptions, `Restricted access labor multiplier applied (x${formatNumberSafe(1 + job.restrictedAccessMultiplier, 2)}).`);
  }

  if (job.nightWork) {
    multipliers = addGlobalModifierImpact(
      true,
      getGlobalModifierImpact(job),
      multipliers,
      assumptions,
      'Night work applies to all scoped items.'
    );
  }

  if (job.phasedWork) {
    multipliers = addSharedMultiplierAdjustment(true, job.phasedWorkMultiplier, multipliers, assumptions, `Phased execution labor condition applied (x${formatNumberSafe(1 + job.phasedWorkMultiplier, 2)}).`);
  }

  if (job.smallJobFactor) {
    multipliers = addSharedMultiplierAdjustment(true, job.smallJobMultiplier, multipliers, assumptions, `Small job factor applied (x${formatNumberSafe(1 + job.smallJobMultiplier, 2)}).`);
  }

  if (job.remoteTravel) {
    multipliers = addSharedMultiplierAdjustment(true, job.remoteTravelMultiplier, multipliers, assumptions, `Remote travel labor condition applied (x${formatNumberSafe(1 + job.remoteTravelMultiplier, 2)}).`);
  }

  if (job.scheduleCompression) {
    multipliers = addSharedMultiplierAdjustment(true, job.scheduleCompressionMultiplier, multipliers, assumptions, `Schedule compression labor condition applied (x${formatNumberSafe(1 + job.scheduleCompressionMultiplier, 2)}).`);
  }

  if (job.deliveryDifficulty === 'constrained') {
    multipliers.cost += 0.05;
    multipliers.hours += 0.05;
    assumptions.push('Constrained delivery condition applied.');
  }

  if (job.deliveryDifficulty === 'difficult') {
    multipliers.cost += 0.1;
    multipliers.hours += 0.1;
    assumptions.push('Difficult delivery condition applied.');
  }

  if (job.mobilizationComplexity === 'medium') {
    multipliers.cost += 0.03;
    multipliers.hours += 0.03;
    assumptions.push('Medium mobilization complexity applied.');
  }

  if (job.mobilizationComplexity === 'high') {
    multipliers.cost += 0.07;
    multipliers.hours += 0.07;
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

    if (job.deliveryLeadDays > 0) {
      assumptions.push(`Estimated delivery lead time: ${job.deliveryLeadDays} business day${job.deliveryLeadDays === 1 ? '' : 's'}.`);
    }
  }

  multipliers.cost *= job.laborRateMultiplier;
  multipliers.hours *= job.laborRateMultiplier;

  if (job.laborRateMultiplier !== 1) {
    assumptions.push(`Custom labor multiplier x${formatNumberSafe(job.laborRateMultiplier, 2)} applied.`);
  }

  if (job.locationLabel.trim()) {
    assumptions.push(`Location condition: ${job.locationLabel.trim()}.`);
  }

  if (job.travelDistanceMiles !== null) {
    assumptions.push(`Approximate job distance from office: ${formatNumberSafe(job.travelDistanceMiles, 1)} miles.`);
  }

  if (job.installerCount > 1) {
    assumptions.push(`Crew planning assumes ${job.installerCount} installers.`);
  }

  const laborAdjustmentAmount = (laborSubtotal * multipliers.cost) - laborSubtotal;
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
    laborCostMultiplier: multipliers.cost,
    laborHoursMultiplier: multipliers.hours,
    laborAdjustmentAmount,
    estimateAdderAmount,
    totalConditionAdjustment: laborAdjustmentAmount + estimateAdderAmount,
    taxPercentApplied,
    assumptions,
    projectConditions,
  };
}

export function buildProjectConditionSummaryLines(jobConditions?: Partial<ProjectJobConditions> | null): string[] {
  const job = normalizeProjectJobConditions(jobConditions);
  const lines: string[] = [];

  if (job.prevailingWage || job.laborRateBasis === 'prevailing') lines.push(`Prevailing wage requirements were included at x${formatNumberSafe(1 + job.prevailingWageMultiplier, 2)} labor.`);
  if (job.nightWork) {
    if (job.nightWorkLaborCostMultiplier !== 0 && job.nightWorkLaborMinutesMultiplier !== 0) {
      lines.push(`Night work applies to all scoped items at x${formatNumberSafe(1 + job.nightWorkLaborCostMultiplier, 2)} labor cost and x${formatNumberSafe(1 + job.nightWorkLaborMinutesMultiplier, 2)} labor hours.`);
    } else if (job.nightWorkLaborCostMultiplier !== 0) {
      lines.push(`Night work applies to all scoped items at x${formatNumberSafe(1 + job.nightWorkLaborCostMultiplier, 2)} labor cost.`);
    } else {
      lines.push(`Night work applies to all scoped items at x${formatNumberSafe(1 + job.nightWorkLaborMinutesMultiplier, 2)} labor hours.`);
    }
  }
  if (job.phasedWork) lines.push(`Phased work sequencing assumptions are included across ${job.phasedWorkPhases} phase${job.phasedWorkPhases === 1 ? '' : 's'} at x${formatNumberSafe(1 + job.phasedWorkMultiplier, 2)} labor.`);
  if (job.occupiedBuilding) lines.push(`Occupied building coordination assumptions are included at x${formatNumberSafe(1 + job.occupiedBuildingMultiplier, 2)} labor.`);
  if (job.restrictedAccess) lines.push(`Restricted access productivity assumptions are included at x${formatNumberSafe(1 + job.restrictedAccessMultiplier, 2)} labor.`);
  if (job.remoteTravel) lines.push(`Remote travel and mobilization assumptions are included at x${formatNumberSafe(1 + job.remoteTravelMultiplier, 2)} labor.`);
  if (job.scheduleCompression) lines.push(`Schedule compression assumptions are included at x${formatNumberSafe(1 + job.scheduleCompressionMultiplier, 2)} labor.`);
  if (job.floors > 1) lines.push(`Multi-floor access assumptions were included (${job.floors} floors).`);
  if (job.deliveryRequired) {
    if (job.deliveryPricingMode === 'flat' && job.deliveryValue !== 0) lines.push(`Delivery was included as a flat allowance of ${formatCurrencySafe(job.deliveryValue)}.`);
    if (job.deliveryPricingMode === 'percent' && job.deliveryValue !== 0) lines.push(`Delivery was included as a ${formatPercentSafe(job.deliveryValue)} allowance.`);
    if (job.deliveryPricingMode === 'included' || job.deliveryValue === 0) lines.push('Delivery was included with no separate line-item allowance.');
    if (job.deliveryLeadDays > 0) lines.push(`Estimated delivery lead time is ${job.deliveryLeadDays} business day${job.deliveryLeadDays === 1 ? '' : 's'}.`);
  }
  if (job.estimateAdderPercent !== 0) lines.push(`Project-wide pricing adder of ${formatPercentSafe(job.estimateAdderPercent)} was included.`);
  if (job.estimateAdderAmount !== 0) lines.push(`Project-wide lump-sum adder of ${formatCurrencySafe(job.estimateAdderAmount)} was included.`);
  if (job.locationLabel.trim()) lines.push(`Location assumptions: ${job.locationLabel.trim()}.`);
  if (job.travelDistanceMiles !== null) lines.push(`Approximate travel distance from office: ${formatNumberSafe(job.travelDistanceMiles, 1)} miles.`);
  if (job.installerCount > 1) lines.push(`Schedule planning assumes a ${job.installerCount}-installer crew.`);

  return lines;
}
