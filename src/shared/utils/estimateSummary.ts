import { EstimateSummary, ProjectRecord, TakeoffLineRecord } from '../types/estimator';
import { computeCrewRecommendation } from './crewRecommendation';
import { computeProjectConditionEffects, normalizeProjectJobConditions } from './jobConditions';
import { calculateWorkDuration } from './workDuration';

export function calculateEstimateSummary(project: ProjectRecord, lines: TakeoffLineRecord[]): EstimateSummary {
  const pricingMode = project.pricingMode || 'labor_and_material';
  const jobConditions = normalizeProjectJobConditions(project.jobConditions);
  const rawMaterialSubtotal = lines.reduce((sum, line) => sum + (line.materialCost * line.qty), 0);
  const rawLaborSubtotal = lines.reduce((sum, line) => sum + (line.laborCost * line.qty), 0);
  const rawLaborHours = lines.reduce((sum, line) => sum + ((line.laborMinutes * line.qty) / 60), 0);

  const materialSubtotal = pricingMode === 'labor_only' ? 0 : rawMaterialSubtotal;
  const laborSubtotal = pricingMode === 'material_only' ? 0 : rawLaborSubtotal;
  const baseLineSubtotal = materialSubtotal + laborSubtotal;

  const effects = computeProjectConditionEffects(project, laborSubtotal, materialSubtotal, baseLineSubtotal);
  const adjustedLaborSubtotal = pricingMode === 'material_only'
    ? 0
    : laborSubtotal + effects.laborAdjustmentAmount;
  const totalLaborHours = pricingMode === 'material_only'
    ? 0
    : Number((rawLaborHours * effects.laborHoursMultiplier).toFixed(2));
  const totalLaborMinutes = Number((totalLaborHours * 60).toFixed(2));
  const { durationDays, durationWeeks } = calculateWorkDuration(totalLaborHours, jobConditions);

  const lineSubtotal = materialSubtotal + adjustedLaborSubtotal + effects.estimateAdderAmount;

  // Labor burden is already represented in the installed labor basis, so do not add it again here.
  const burdenAmount = 0;
  const overheadAmount = lineSubtotal * (project.overheadPercent / 100);
  const profitAmount = (lineSubtotal + overheadAmount) * (project.profitPercent / 100);
  const taxAmount = pricingMode === 'labor_only' ? 0 : materialSubtotal * (effects.taxPercentApplied / 100);
  const baseBidTotal = lineSubtotal + burdenAmount + overheadAmount + profitAmount + taxAmount;

  const crewRecommendation = computeCrewRecommendation(totalLaborHours, lines, jobConditions);

  const paid = jobConditions.installerPaidDayHours;
  const breakH = jobConditions.dailyBreakHoursPerInstaller;
  const setupCleanup = jobConditions.fieldSetupCleanupHoursPerInstallerDay;
  const productiveHrsPerInstaller = Math.max(0.25, paid - breakH - setupCleanup);
  const productiveCrewHoursPerDay = Number(
    (productiveHrsPerInstaller * Math.max(1, jobConditions.installerCount)).toFixed(2)
  );

  return {
    materialSubtotal,
    laborSubtotal,
    adjustedLaborSubtotal,
    totalLaborMinutes,
    totalLaborHours,
    durationDays,
    durationWeeks,
    lineSubtotal,
    conditionAdjustmentAmount: effects.totalConditionAdjustment,
    conditionLaborMultiplier: effects.laborCostMultiplier,
    conditionLaborHoursMultiplier: effects.laborHoursMultiplier,
    burdenAmount,
    overheadAmount,
    profitAmount,
    taxAmount,
    laborOverheadAmount: 0,
    laborProfitAmount: 0,
    subLaborManagementFeeAmount: 0,
    materialLoadedSubtotal: Number((materialSubtotal + taxAmount).toFixed(2)),
    laborLoadedSubtotal: Number(adjustedLaborSubtotal.toFixed(2)),
    laborCompanionProposalTotal: Number(adjustedLaborSubtotal.toFixed(2)),
    baseBidTotal,
    conditionAssumptions: effects.assumptions,
    projectConditions: effects.projectConditions,
    productiveCrewHoursPerDay,
    materialWasteAllowanceAmount: 0,
    installerFieldSuppliesAmount: 0,
    laborLearningCurveAllowanceAmount: 0,
    crewRecommendation,
  };
}