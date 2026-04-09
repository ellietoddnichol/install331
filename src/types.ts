
export type UOM = 'EA' | 'LF' | 'SF' | 'CY' | 'HR';

export interface Modifier {
  id: string;
  name: string;
  priceAdjustment: number;
  laborAdjustment: number;
}

export interface ModifierGroup {
  id: string;
  name: string;
  options: Modifier[];
  required?: boolean;
}

export interface CatalogItem {
  id: string;
  sku: string;
  category: string;
  subcategory?: string;
  family?: string;
  description: string;
  manufacturer?: string;
  /** Commercial / go-to-market brand line (may match manufacturer or a sub-brand). */
  brand?: string;
  model?: string;
  /** Full manufacturer catalog or part model number (distinct from short `model` label when both used). */
  modelNumber?: string;
  /** Product family / series / collection name. */
  series?: string;
  /** URL for a product image (https, CDN, or in-app path); optional. */
  imageUrl?: string;
  uom: UOM;
  baseMaterialCost: number;
  baseLaborMinutes: number;
  laborUnitType?: string;
  taxable: boolean;
  adaFlag: boolean;
  tags?: string[];
  notes?: string;
  active: boolean;
}

export interface ProjectSettings {
  laborRate: number;
  taxRate: number;
  overheadPct: number;
  profitPct: number;
  laborBurdenPct: number;
  workDayHours: number;
  crewSize: number;
  
  selectedConditions: {
    union: boolean;
    prevailing: boolean;
    remote: boolean;
    night: boolean;
    occupied: boolean;
    remodel: boolean;
    phased: boolean;
  };
  
  conditionMultipliers: {
    union: number;
    prevailing: number;
    remote: number;
    night: number;
    occupied: number;
    remodel: number;
    phased: number;
  };

  projectSize: 'Small' | 'Medium' | 'Large';
  floorLevel: 'Ground' | '2-3' | '4+';
  distanceFromDrop: '0-50' | '50-150' | '150+';
  accessDifficulty: 'Easy' | 'Moderate' | 'Difficult';
  installationHeight: 'Under 8' | '8-12' | '12-16' | '16+';
  materialHandling: 'Forklift' | 'Manual' | 'Multiple Moves';
  wallSubstrate: 'Drywall' | 'CMU' | 'Concrete' | 'Tile';
  layoutComplexity: 'Standard' | 'Irregular' | 'Custom';
  travelSurcharge?: number;
}

export interface AddIn {
  id: string;
  name: string;
  cost: number;
  laborMinutes: number;
  isActive: boolean;
}

export interface ProjectLine {
  lineId: string;
  catalogItemId?: string;
  manualDescription?: string;
  scopeId: string;
  roomId: string;
  qty: number;
  notes?: string;
  alternateId?: string;
  isRemoval?: boolean;
  isRelocation?: boolean;
  baseType?: 'Wood' | 'Metal' | 'Concrete' | 'None';
  addIns?: AddIn[];
  needsReview?: boolean;
  
  // Overrides
  materialUnitCostOverride?: number;
  laborMinutesOverride?: number;
}

export interface Scope {
  id: string;
  name: string;
  division?: string;
  /** Aligns with v1 `PricingMode`; `material_and_labor` is accepted as a legacy alias in the estimate engine. */
  pricingMode: 'material_only' | 'labor_only' | 'labor_and_material' | 'material_and_labor';
}

export interface Room {
  id: string;
  name: string;
  floor?: string;
}

export interface Alternate {
  id: string;
  name: string;
  description?: string;
}

export interface ProposalSettings {
  title: string;
  projectName: string;
  projectAddress: string;
  clientName: string;
  companyName: string;
  companyAddress1: string;
  companyAddress2: string;
  footerText: string;
  showLineItems: boolean;
  breakdownMode: 'scope' | 'room' | 'combined';
  scopeOfWork?: string;
  clarifications?: string[];
  exclusions?: string[];
}

export type ProjectStatus = 'Draft' | 'Submitted' | 'Awarded' | 'Lost' | 'Archived';

export interface Bundle {
  id: string;
  name: string;
  items: { catalogItemId: string; qty: number }[];
}

export interface Project {
  id: string;
  projectNumber?: string;
  name: string;
  clientName: string;
  gcName?: string;
  address: string;
  bidDate?: string;
  dueDate?: string;
  projectType?: string;
  estimator?: string;
  status: ProjectStatus;
  createdDate: string;
  settings: ProjectSettings;
  proposalSettings: ProposalSettings;
  scopes: Scope[];
  rooms: Room[];
  bundles: Bundle[];
  alternates: Alternate[];
  lines: ProjectLine[];
}

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  companyName: string;
  companyAddress1: string;
  companyAddress2: string;
  preferences: {
    defaultLaborRate: number;
    defaultLaborBurdenPct?: number;
    defaultOverheadPct: number;
    defaultProfitPct: number;
    defaultWorkDayHours: number;
    defaultCrewSize: number;
    currency: string;
  };
}

// Calculation Results
export interface CalculatedLine {
  lineId: string;
  description: string;
  qty: number;
  materialCost: number;
  laborCost: number;
  taxCost: number;
  addInCost: number;
  laborHours: number;
  total: number;
  alternateId?: string;
  scopeId: string;
  roomId: string;
}

export interface GroupSummary {
  id: string;
  name: string;
  total: number;
  lines: CalculatedLine[];
}

export interface EstimateResult {
  lines: CalculatedLine[];
  baseBidTotal: number;
  totalPrice: number;
  totalLaborHours: number;
  totalMaterialCost: number;
  totalLaborCost: number;
  totalTaxCost: number;
  travelSurcharge: number;
  byRoom: Record<string, GroupSummary>;
  byScope: Record<string, GroupSummary>;
  byAlternate: Record<string, GroupSummary>;
  grandTotal: number;
}
