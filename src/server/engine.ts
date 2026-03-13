
import { Project, ProjectSettings, ProjectLine, CalculatedLine, EstimateResult, GroupSummary, CatalogItem } from '../types';

export function calculateEstimate(project: Project, catalog: CatalogItem[]): EstimateResult {
  const { settings, lines, scopes, rooms, alternates } = project;
  const catalogMap = new Map(catalog.map(item => [item.id, item]));
  const scopeMap = new Map(scopes.map(s => [s.id, s]));
  const roomMap = new Map(rooms.map(r => [r.id, r]));
  const altMap = new Map(alternates.map(a => [a.id, a]));

  const calculatedLines: CalculatedLine[] = lines.map(line => {
    const item = line.catalogItemId ? catalogMap.get(line.catalogItemId) : null;
    const scope = scopeMap.get(line.scopeId);
    const description = line.manualDescription || item?.description || 'Unknown Item';
    
    // Base costs
    let unitMat = line.materialUnitCostOverride ?? item?.baseMaterialCost ?? 0;
    let unitLabMins = line.laborMinutesOverride ?? item?.baseLaborMinutes ?? 0;

    // Pricing mode compatibility: support material-only, labor-only, and combined modes.
    const pricingMode = String((scope as any)?.pricingMode || 'material_and_labor').toLowerCase();
    if (pricingMode === 'material_only') {
      unitLabMins = 0;
    } else if (pricingMode === 'labor_only') {
      unitMat = 0;
    }

    // Apply multipliers
    let labMultiplier = 1.0;
    if (settings.selectedConditions.union) labMultiplier *= settings.conditionMultipliers.union;
    if (settings.selectedConditions.prevailing) labMultiplier *= settings.conditionMultipliers.prevailing;
    if (settings.selectedConditions.remote) labMultiplier *= settings.conditionMultipliers.remote;
    if (settings.selectedConditions.night) labMultiplier *= settings.conditionMultipliers.night;
    if (settings.selectedConditions.occupied) labMultiplier *= settings.conditionMultipliers.occupied;
    if (settings.selectedConditions.remodel) labMultiplier *= settings.conditionMultipliers.remodel;
    if (settings.selectedConditions.phased) labMultiplier *= settings.conditionMultipliers.phased;

    // Complexity Factors (RSMeans style)
    if (settings.projectSize === 'Small') labMultiplier *= 1.15;
    if (settings.projectSize === 'Large') labMultiplier *= 0.95;
    
    if (settings.floorLevel === '2-3') labMultiplier *= 1.05;
    if (settings.floorLevel === '4+') labMultiplier *= 1.15;
    
    if (settings.distanceFromDrop === '50-150') labMultiplier *= 1.05;
    if (settings.distanceFromDrop === '150+') labMultiplier *= 1.15;
    
    if (settings.accessDifficulty === 'Moderate') labMultiplier *= 1.1;
    if (settings.accessDifficulty === 'Difficult') labMultiplier *= 1.25;
    
    if (settings.installationHeight === '8-12') labMultiplier *= 1.1;
    if (settings.installationHeight === '12-16') labMultiplier *= 1.2;
    if (settings.installationHeight === '16+') labMultiplier *= 1.35;
    
    if (settings.materialHandling === 'Manual') labMultiplier *= 1.15;
    if (settings.materialHandling === 'Multiple Moves') labMultiplier *= 1.25;
    
    if (settings.wallSubstrate === 'CMU') labMultiplier *= 1.1;
    if (settings.wallSubstrate === 'Concrete') labMultiplier *= 1.2;
    if (settings.wallSubstrate === 'Tile') labMultiplier *= 1.3;
    
    if (settings.layoutComplexity === 'Irregular') labMultiplier *= 1.15;
    if (settings.layoutComplexity === 'Custom') labMultiplier *= 1.3;

    const totalLabMins = unitLabMins * line.qty * labMultiplier;
    const baseLaborCost = (totalLabMins / 60) * settings.laborRate;
    const laborCost = baseLaborCost * (1 + (settings.laborBurdenPct || 0));
    
    const materialCost = unitMat * line.qty;
    const taxCost = (item?.taxable || line.manualDescription !== undefined) ? materialCost * (settings.taxRate || 0) : 0;
    
    const addInCost = (line.addIns || [])
      .filter(a => a.isActive)
      .reduce((sum, a) => sum + a.cost + (a.laborMinutes / 60 * settings.laborRate * (1 + (settings.laborBurdenPct || 0))), 0);

    const subtotal = materialCost + laborCost + taxCost + addInCost;
    
    // Apply Overhead & Profit
    const total = subtotal * (1 + settings.overheadPct + settings.profitPct);

    return {
      lineId: line.lineId,
      description,
      qty: line.qty,
      materialCost,
      laborCost,
      taxCost,
      addInCost,
      laborHours: totalLabMins / 60,
      total,
      alternateId: line.alternateId,
      scopeId: line.scopeId,
      roomId: line.roomId
    };
  });

  const baseBidLines = calculatedLines.filter(l => !l.alternateId);
  const baseBidTotal = baseBidLines.reduce((sum, l) => sum + l.total, 0);
  const totalLaborHours = calculatedLines.reduce((sum, l) => sum + l.laborHours, 0);
  const totalMaterialCost = calculatedLines.reduce((sum, l) => sum + l.materialCost, 0);
  const totalLaborCost = calculatedLines.reduce((sum, l) => sum + l.laborCost, 0);
  const totalTaxCost = calculatedLines.reduce((sum, l) => sum + l.taxCost, 0);
  const travelSurcharge = settings.travelSurcharge || 0;

  const groupBy = (lines: CalculatedLine[], key: 'roomId' | 'scopeId' | 'alternateId', map: Map<string, any>) => {
    const groups: Record<string, GroupSummary> = {};
    lines.forEach(line => {
      const id = line[key] || 'unassigned';
      const name = map.get(id)?.name || (id === 'unassigned' ? 'Unassigned' : id);
      if (!groups[id]) {
        groups[id] = { id, name, total: 0, lines: [] };
      }
      groups[id].total += line.total;
      groups[id].lines.push(line);
    });
    return groups;
  };

  return {
    lines: calculatedLines,
    baseBidTotal,
    totalPrice: baseBidTotal,
    totalLaborHours,
    totalMaterialCost,
    totalLaborCost,
    totalTaxCost,
    travelSurcharge,
    byRoom: groupBy(calculatedLines, 'roomId', roomMap),
    byScope: groupBy(calculatedLines, 'scopeId', scopeMap),
    byAlternate: groupBy(calculatedLines.filter(l => l.alternateId), 'alternateId', altMap),
    grandTotal: baseBidTotal + travelSurcharge
  };
}
