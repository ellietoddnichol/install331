export type ProjectStatus = 'Draft' | 'Submitted' | 'Awarded' | 'Lost' | 'Archived';
export type PricingMode = 'material_only' | 'labor_only' | 'labor_and_material';
export type DeliveryPricingMode = 'included' | 'flat' | 'percent';

export interface ProjectJobConditions {
  locationLabel: string;
  travelDistanceMiles: number | null;
  installerCount: number;
  locationTaxPercent: number | null;
  unionWage: boolean;
  unionWageMultiplier: number;
  prevailingWage: boolean;
  prevailingWageMultiplier: number;
  laborRateBasis: 'standard' | 'union' | 'prevailing';
  laborRateMultiplier: number;
  floors: number;
  floorMultiplierPerFloor: number;
  elevatorAvailable: boolean;
  occupiedBuilding: boolean;
  occupiedBuildingMultiplier: number;
  restrictedAccess: boolean;
  restrictedAccessMultiplier: number;
  afterHoursWork: boolean;
  afterHoursMultiplier: number;
  phasedWork: boolean;
  phasedWorkMultiplier: number;
  deliveryDifficulty: 'standard' | 'constrained' | 'difficult';
  deliveryRequired: boolean;
  deliveryPricingMode: DeliveryPricingMode;
  deliveryValue: number;
  smallJobFactor: boolean;
  smallJobMultiplier: number;
  mobilizationComplexity: 'low' | 'medium' | 'high';
  remoteTravel: boolean;
  remoteTravelMultiplier: number;
  scheduleCompression: boolean;
  scheduleCompressionMultiplier: number;
  estimateAdderPercent: number;
  estimateAdderAmount: number;
}

export interface ProjectRecord {
  id: string;
  projectNumber: string | null;
  projectName: string;
  clientName: string | null;
  generalContractor: string | null;
  estimator: string | null;
  bidDate: string | null;
  proposalDate: string | null;
  dueDate: string | null;
  address: string | null;
  projectType: string | null;
  projectSize: string | null;
  floorLevel: string | null;
  accessDifficulty: string | null;
  installHeight: string | null;
  materialHandling: string | null;
  wallSubstrate: string | null;
  laborBurdenPercent: number;
  overheadPercent: number;
  profitPercent: number;
  taxPercent: number;
  pricingMode: PricingMode;
  selectedScopeCategories: string[];
  jobConditions: ProjectJobConditions;
  status: ProjectStatus;
  notes: string | null;
  specialNotes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RoomRecord {
  id: string;
  projectId: string;
  roomName: string;
  sortOrder: number;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export type TakeoffPricingSource = 'auto' | 'manual';

export interface TakeoffLineRecord {
  id: string;
  projectId: string;
  roomId: string;
  sourceType: string;
  sourceRef: string | null;
  description: string;
  sku: string | null;
  category: string | null;
  subcategory: string | null;
  baseType: string | null;
  qty: number;
  unit: string;
  materialCost: number;
  baseMaterialCost: number;
  laborMinutes: number;
  laborCost: number;
  baseLaborCost: number;
  pricingSource: TakeoffPricingSource;
  unitSell: number;
  lineTotal: number;
  notes: string | null;
  bundleId: string | null;
  catalogItemId: string | null;
  variantId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ModifierRecord {
  id: string;
  name: string;
  modifierKey: string;
  appliesToCategories: string[];
  addLaborMinutes: number;
  addMaterialCost: number;
  percentLabor: number;
  percentMaterial: number;
  active: boolean;
  updatedAt: string;
}

export interface BundleRecord {
  id: string;
  bundleName: string;
  category: string | null;
  active: boolean;
  updatedAt: string;
}

export interface BundleItemRecord {
  id: string;
  bundleId: string;
  catalogItemId: string | null;
  sku: string | null;
  description: string;
  qty: number;
  materialCost: number;
  laborMinutes: number;
  laborCost: number;
  sortOrder: number;
  notes: string | null;
}

export interface LineModifierRecord {
  id: string;
  lineId: string;
  modifierId: string;
  name: string;
  addMaterialCost: number;
  addLaborMinutes: number;
  percentMaterial: number;
  percentLabor: number;
  createdAt: string;
}

export interface SettingsRecord {
  id: string;
  companyName: string;
  companyAddress: string;
  companyPhone: string;
  companyEmail: string;
  logoUrl: string;
  defaultLaborRatePerHour: number;
  defaultOverheadPercent: number;
  defaultProfitPercent: number;
  defaultTaxPercent: number;
  defaultLaborBurdenPercent: number;
  proposalIntro: string;
  proposalTerms: string;
  proposalExclusions: string;
  proposalClarifications: string;
  proposalAcceptanceLabel: string;
  updatedAt: string;
}

export interface CatalogSyncStatusRecord {
  id: string;
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  status: 'never' | 'running' | 'success' | 'failed';
  message: string | null;
  itemsSynced: number;
  modifiersSynced: number;
  bundlesSynced: number;
  bundleItemsSynced: number;
  warnings: string[];
}

export interface ProjectFileRecord {
  id: string;
  projectId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
}
