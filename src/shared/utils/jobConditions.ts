import { GlobalModifierImpact, ProjectConditions, ProjectJobConditions, ProjectRecord } from '../types/estimator';
import { formatCurrencySafe, formatNumberSafe, formatPercentSafe } from '../../utils/numberFormat';

/**
 * Default field-schedule fields. Install minute totals on lines are "hands-on" work; calendar duration
 * uses per-installer paid hours minus breaks and {@link ProjectJobConditions.fieldSetupCleanupHoursPerInstallerDay}
 * to compute crew capacity (productive crew-hr / day = per-installer install capacity × crew size).
 */
export const OFFICE_FIELD_SCHEDULE_DEFAULTS: Pick<
  ProjectJobConditions,
  | 'installerPaidDayHours'
  | 'dailyBreakHoursPerInstaller'
  | 'fieldSetupCleanupHoursPerInstallerDay'
  | 'laborLearningCurvePercent'
  | 'materialWastePercent'
  | 'installerFieldSuppliesPercent'
  | 'installerFieldSuppliesFlat'
> = {
  installerPaidDayHours: 8,
  dailyBreakHoursPerInstaller: 0,
  fieldSetupCleanupHoursPerInstallerDay: 1,
  laborLearningCurvePercent: 0,
  materialWastePercent: 0,
  installerFieldSuppliesPercent: 0,
  installerFieldSuppliesFlat: 0,
};

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
  deliveryQuotedSeparately: false,
  smallJobFactor: false,
  smallJobMultiplier: 0.06,
  mobilizationComplexity: 'low',
  remoteTravel: false,
  remoteTravelMultiplier: 0.09,
  scheduleCompression: false,
  scheduleCompressionMultiplier: 0.1,
  performanceBondRequired: false,
  performanceBondPercent: 0,
  estimateAdderPercent: 0,
  estimateAdderAmount: 0,
  ...OFFICE_FIELD_SCHEDULE_DEFAULTS,
  fieldSetupCleanupHoursPerInstallerDay: 0,
};

export function createDefaultProjectJobConditions(): ProjectJobConditions {
  return { ...DEFAULT_JOB_CONDITIONS };
}

/** First percentage like `5%` or `5.5 %` in text; for bond / fee cues from intake. */
export function extractLeadingPercentFromText(text: string): number | null {
  const m = String(text || '').match(/(\d+(?:\.\d+)?)\s*%/);
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n) || n < 0 || n > 100) return null;
  return n;
}

export function bondJobConditionsPatchFromAssumptions(
  assumptions: Array<{ kind: string; text: string }>
): Partial<ProjectJobConditions> {
  const out: Partial<ProjectJobConditions> = {};
  for (const a of assumptions) {
    if (a.kind !== 'bond') continue;
    out.performanceBondRequired = true;
    const p = extractLeadingPercentFromText(a.text);
    if (p !== null) out.performanceBondPercent = p;
  }
  return out;
}

/** True when travel miles should appear in proposal / assumption copy (omit null and zero — not customer-useful). */
export function isMeaningfulTravelDistanceMiles(miles: number | null | undefined): miles is number {
  if (miles === null || miles === undefined) return false;
  const n = Number(miles);
  return Number.isFinite(n) && n > 0;
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
  const numeric = (value: unknown, fallback: number) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  };

  const installerPaidDayHours = clampHours(
    numeric((merged as Partial<ProjectJobConditions>).installerPaidDayHours, DEFAULT_JOB_CONDITIONS.installerPaidDayHours),
    4,
    12
  );
  const dailyBreakHoursPerInstaller = clampBreakHours(
    numeric((merged as Partial<ProjectJobConditions>).dailyBreakHoursPerInstaller, DEFAULT_JOB_CONDITIONS.dailyBreakHoursPerInstaller),
    installerPaidDayHours
  );
  const rawFieldSetup = numeric(
    (merged as Partial<ProjectJobConditions>).fieldSetupCleanupHoursPerInstallerDay,
    DEFAULT_JOB_CONDITIONS.fieldSetupCleanupHoursPerInstallerDay
  );
  const maxSetupForDay = Math.max(0, installerPaidDayHours - dailyBreakHoursPerInstaller - 0.25);
  const fieldSetupCleanupHoursPerInstallerDay = Math.max(0, Math.min(6, rawFieldSetup, maxSetupForDay));

  const performanceBondPercent = clampPercent(
    numeric((merged as Partial<ProjectJobConditions>).performanceBondPercent, DEFAULT_JOB_CONDITIONS.performanceBondPercent),
    0,
    100
  );

  return {
    ...merged,
    unionWage: false,
    prevailingWage: false,
    laborRateBasis: 'union',
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
    performanceBondRequired: Boolean((merged as Partial<ProjectJobConditions>).performanceBondRequired),
    performanceBondPercent,
    estimateAdderPercent: Number.isFinite(Number(merged.estimateAdderPercent)) ? Number(merged.estimateAdderPercent) : 0,
    estimateAdderAmount: Number.isFinite(Number(merged.estimateAdderAmount)) ? Number(merged.estimateAdderAmount) : 0,
    deliveryQuotedSeparately: Boolean((merged as Partial<ProjectJobConditions>).deliveryQuotedSeparately),
    installerPaidDayHours,
    dailyBreakHoursPerInstaller,
    fieldSetupCleanupHoursPerInstallerDay,
    laborLearningCurvePercent: clampPercent(
      numeric((merged as Partial<ProjectJobConditions>).laborLearningCurvePercent, DEFAULT_JOB_CONDITIONS.laborLearningCurvePercent),
      0,
      100
    ),
    materialWastePercent: clampPercent(
      numeric((merged as Partial<ProjectJobConditions>).materialWastePercent, DEFAULT_JOB_CONDITIONS.materialWastePercent),
      0,
      100
    ),
    installerFieldSuppliesPercent: clampPercent(
      numeric((merged as Partial<ProjectJobConditions>).installerFieldSuppliesPercent, DEFAULT_JOB_CONDITIONS.installerFieldSuppliesPercent),
      0,
      100
    ),
    installerFieldSuppliesFlat: Math.max(
      0,
      numeric((merged as Partial<ProjectJobConditions>).installerFieldSuppliesFlat, DEFAULT_JOB_CONDITIONS.installerFieldSuppliesFlat)
    ),
  };
}

function clampHours(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function clampBreakHours(breakH: number, paidDay: number): number {
  if (!Number.isFinite(breakH) || breakH <= 0) return 0;
  const paid = Number.isFinite(paidDay) && paidDay > 0 ? paidDay : 8;
  return Math.min(Math.max(0, breakH), Math.max(0, paid - 0.25));
}

function clampPercent(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

export function recommendedPhasedWorkMultiplier(phaseCount: number): number {
  const normalizedPhaseCount = Number.isFinite(phaseCount) && phaseCount > 1 ? Math.round(phaseCount) : 1;
  return Number((Math.max(0, normalizedPhaseCount - 1) * 0.07).toFixed(2));
}

const DELIVERY_FLAT_FEE_MILES_MIN = 50;
const DELIVERY_FLAT_FEE_MILES_MAX = 100;
const DELIVERY_FLAT_FEE_AMOUNT = 100;

/**
 * Auto delivery vs distance: no fee under 50 mi; $100 flat for 50–100 mi; over 100 mi no estimate adder — travel priced separately.
 */
export function recommendDeliveryPlan(distanceMiles: number | null | undefined, difficulty: ProjectJobConditions['deliveryDifficulty'] = 'standard') {
  if (distanceMiles === null || distanceMiles === undefined || !Number.isFinite(distanceMiles) || distanceMiles < 0) {
    return {
      deliveryRequired: false,
      deliveryPricingMode: 'included' as const,
      deliveryValue: 0,
      deliveryLeadDays: 0,
      deliveryQuotedSeparately: false,
    };
  }

  let leadDayOffset = 0;
  if (difficulty === 'constrained') leadDayOffset = 1;
  if (difficulty === 'difficult') leadDayOffset = 2;

  const distanceLeadDays = distanceMiles <= 25 ? 1 : distanceMiles <= 60 ? 2 : distanceMiles <= 120 ? 3 : distanceMiles <= 250 ? 5 : 7;

  if (distanceMiles < DELIVERY_FLAT_FEE_MILES_MIN) {
    return {
      deliveryRequired: false,
      deliveryPricingMode: 'included' as const,
      deliveryValue: 0,
      deliveryLeadDays: 0,
      deliveryQuotedSeparately: false,
    };
  }

  if (distanceMiles > DELIVERY_FLAT_FEE_MILES_MAX) {
    return {
      deliveryRequired: true,
      deliveryPricingMode: 'included' as const,
      deliveryValue: 0,
      deliveryLeadDays: distanceLeadDays + leadDayOffset,
      deliveryQuotedSeparately: true,
    };
  }

  return {
    deliveryRequired: true,
    deliveryPricingMode: 'flat' as const,
    deliveryValue: DELIVERY_FLAT_FEE_AMOUNT,
    deliveryLeadDays: distanceLeadDays + leadDayOffset,
    deliveryQuotedSeparately: false,
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
    if (job.deliveryQuotedSeparately) {
      if (isMeaningfulTravelDistanceMiles(job.travelDistanceMiles)) {
        const miles = job.travelDistanceMiles as number;
        assumptions.push(
          `Job site is approximately ${formatNumberSafe(miles, 1)} miles from the office. Delivery and travel will be priced separately and are not included in this estimate total.`
        );
      } else {
        assumptions.push('Delivery and travel will be priced separately and are not included in this estimate total.');
      }
    } else if (job.deliveryPricingMode === 'flat' && job.deliveryValue !== 0) {
      directAdjustmentAmount += job.deliveryValue;
      assumptions.push(`Delivery allowance added as a flat amount (${formatCurrencySafe(job.deliveryValue)}).`);
    } else if (job.deliveryPricingMode === 'percent' && job.deliveryValue !== 0) {
      const deliveryPercentAmount = baseLineSubtotal * (job.deliveryValue / 100);
      directAdjustmentAmount += deliveryPercentAmount;
      assumptions.push(`Delivery allowance added at ${formatPercentSafe(job.deliveryValue)} of base pricing.`);
    } else if (job.deliveryPricingMode === 'included' || job.deliveryValue === 0) {
      if (!job.deliveryQuotedSeparately) {
        assumptions.push('Delivery scope is included with no separate pricing adder.');
      }
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

  const travelMiles = job.travelDistanceMiles;
  if (isMeaningfulTravelDistanceMiles(travelMiles) && !(job.deliveryRequired && job.deliveryQuotedSeparately)) {
    assumptions.push(`Approximate job distance from office: ${formatNumberSafe(travelMiles, 1)} miles.`);
  }

  if (job.installerCount > 1) {
    assumptions.push(`Crew planning assumes ${job.installerCount} installers.`);
  }

  const laborAdjustmentAmount = (laborSubtotal * multipliers.cost) - laborSubtotal;
  const percentAdderAmount = baseLineSubtotal * (job.estimateAdderPercent / 100);
  const bondAdderAmount =
    job.performanceBondRequired && job.performanceBondPercent > 0
      ? baseLineSubtotal * (job.performanceBondPercent / 100)
      : 0;
  if (bondAdderAmount > 0) {
    assumptions.push(
      `Performance/surety bond allowance (${formatPercentSafe(job.performanceBondPercent)} of base bid) included in condition adders.`
    );
  }
  const estimateAdderAmount = percentAdderAmount + job.estimateAdderAmount + directAdjustmentAmount + bondAdderAmount;
  const rawMaterialTaxPercent = job.locationTaxPercent ?? project.taxPercent;
  const taxPercentApplied = materialSubtotal > 0 ? rawMaterialTaxPercent : 0;

  if (job.estimateAdderPercent !== 0) {
    assumptions.push(`Project condition adder (${formatPercentSafe(job.estimateAdderPercent)}) applied.`);
  }

  if (job.estimateAdderAmount !== 0) {
    assumptions.push(`Project condition lump sum adder (${formatCurrencySafe(job.estimateAdderAmount)}) applied.`);
  }

  if (job.locationTaxPercent !== null) {
    if (materialSubtotal > 0) {
      assumptions.push(`Location tax override (${formatPercentSafe(job.locationTaxPercent)}) applied to material.`);
    } else {
      assumptions.push(
        `Location tax override (${formatPercentSafe(job.locationTaxPercent)}) not applied (no material scope in this estimate).`
      );
    }
  } else if (materialSubtotal <= 0 && project.taxPercent > 0) {
    assumptions.push('Material tax not applied (no material scope in this estimate).');
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
    if (job.deliveryQuotedSeparately) {
      if (isMeaningfulTravelDistanceMiles(job.travelDistanceMiles)) {
        const miles = job.travelDistanceMiles as number;
        lines.push(
          `Approximately ${formatNumberSafe(miles, 1)} miles from the office: delivery and travel will be priced separately (not in this estimate total).`
        );
      } else {
        lines.push('Delivery and travel will be priced separately (not in this estimate total).');
      }
    } else if (job.deliveryPricingMode === 'flat' && job.deliveryValue !== 0) {
      lines.push(`Delivery was included as a flat allowance of ${formatCurrencySafe(job.deliveryValue)}.`);
    } else if (job.deliveryPricingMode === 'percent' && job.deliveryValue !== 0) {
      lines.push(`Delivery was included as a ${formatPercentSafe(job.deliveryValue)} allowance.`);
    } else if ((job.deliveryPricingMode === 'included' || job.deliveryValue === 0) && !job.deliveryQuotedSeparately) {
      lines.push('Delivery was included with no separate line-item allowance.');
    }
    if (job.deliveryLeadDays > 0) lines.push(`Estimated delivery lead time is ${job.deliveryLeadDays} business day${job.deliveryLeadDays === 1 ? '' : 's'}.`);
  }
  if (job.estimateAdderPercent !== 0) lines.push(`Project-wide pricing adder of ${formatPercentSafe(job.estimateAdderPercent)} was included.`);
  if (job.estimateAdderAmount !== 0) lines.push(`Project-wide lump-sum adder of ${formatCurrencySafe(job.estimateAdderAmount)} was included.`);
  if (job.performanceBondRequired && job.performanceBondPercent > 0) {
    lines.push(
      `Performance/surety bond allowance of ${formatPercentSafe(job.performanceBondPercent)} of the base bid was included.`
    );
  }
  if (job.locationLabel.trim()) lines.push(`Location assumptions: ${job.locationLabel.trim()}.`);
  const travelMilesForSummary = job.travelDistanceMiles;
  if (isMeaningfulTravelDistanceMiles(travelMilesForSummary) && !(job.deliveryRequired && job.deliveryQuotedSeparately)) {
    lines.push(`Approximate travel distance from office: ${formatNumberSafe(travelMilesForSummary, 1)} miles.`);
  }
  if (job.installerCount > 1) lines.push(`Schedule planning assumes a ${job.installerCount}-installer crew.`);
  return lines;
}
