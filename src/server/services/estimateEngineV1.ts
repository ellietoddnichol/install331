import { EstimateSummary, ProjectRecord, TakeoffLineRecord } from '../../shared/types/estimator.ts';
import { computeProjectConditionEffects, normalizeProjectJobConditions } from '../../shared/utils/jobConditions.ts';

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
  const crewHoursPerDay = Math.max(1, jobConditions.installerCount) * 8;
  const durationDays = totalLaborHours > 0 ? Math.max(1, Math.ceil(totalLaborHours / crewHoursPerDay)) : 0;

  const lineSubtotal = materialSubtotal + adjustedLaborSubtotal + effects.estimateAdderAmount;

  const burdenAmount = pricingMode === 'material_only' ? 0 : adjustedLaborSubtotal * (project.laborBurdenPercent / 100);
  const overheadAmount = (lineSubtotal + burdenAmount) * (project.overheadPercent / 100);
  const profitAmount = (lineSubtotal + burdenAmount + overheadAmount) * (project.profitPercent / 100);
  const taxAmount = pricingMode === 'labor_only' ? 0 : materialSubtotal * (effects.taxPercentApplied / 100);
  const baseBidTotal = lineSubtotal + burdenAmount + overheadAmount + profitAmount + taxAmount;

  return {
    materialSubtotal,
    laborSubtotal,
    adjustedLaborSubtotal,
    totalLaborHours,
    durationDays,
    lineSubtotal,
    conditionAdjustmentAmount: effects.totalConditionAdjustment,
    conditionLaborMultiplier: effects.laborCostMultiplier,
    conditionLaborHoursMultiplier: effects.laborHoursMultiplier,
    burdenAmount,
    overheadAmount,
    profitAmount,
    taxAmount,
    baseBidTotal,
    conditionAssumptions: effects.assumptions,
    projectConditions: effects.projectConditions,
  };
}
