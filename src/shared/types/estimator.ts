export type ProjectStatus = 'Draft' | 'Submitted' | 'Awarded' | 'Lost' | 'Archived';
export type PricingMode = 'material_only' | 'labor_only' | 'labor_and_material';
export type DeliveryPricingMode = 'included' | 'flat' | 'percent';

export interface ProjectConditions {
  unionLaborBaseline: true;
  nightWork: boolean;
}

export interface GlobalModifierImpact {
  laborCostMultiplier?: number;
  laborMinutesMultiplier?: number;
  notes?: string[];
}

export interface ProjectJobConditions {
  locationLabel: string;
  travelDistanceMiles: number | null;
  installerCount: number;
  locationTaxPercent: number | null;
  unionWage: boolean;
  unionWageMultiplier: number;
  prevailingWage: boolean;
  prevailingWageMultiplier: number;
  laborRateBasis: 'union' | 'prevailing';
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
  nightWork: boolean;
  nightWorkLaborCostMultiplier: number;
  nightWorkLaborMinutesMultiplier: number;
  phasedWork: boolean;
  phasedWorkPhases: number;
  phasedWorkMultiplier: number;
  deliveryDifficulty: 'standard' | 'constrained' | 'difficult';
  deliveryRequired: boolean;
  deliveryPricingMode: DeliveryPricingMode;
  deliveryValue: number;
  deliveryLeadDays: number;
  deliveryAutoCalculated: boolean;
  /** True when distance exceeds the auto flat-fee band; travel/delivery quoted separately (no $ in estimate). */
  deliveryQuotedSeparately: boolean;
  smallJobFactor: boolean;
  smallJobMultiplier: number;
  mobilizationComplexity: 'low' | 'medium' | 'high';
  remoteTravel: boolean;
  remoteTravelMultiplier: number;
  scheduleCompression: boolean;
  scheduleCompressionMultiplier: number;
  estimateAdderPercent: number;
  estimateAdderAmount: number;
  /** Paid field day length per installer (used with breaks for schedule math). Default 8. */
  installerPaidDayHours: number;
  /** Non-productive time per installer per day (lunch, breaks) subtracted from paid day for duration only. */
  dailyBreakHoursPerInstaller: number;
  /** Extra labor hours and labor $ vs catalog baseline (ramp-in, unfamiliar scope). Applied before job multipliers. */
  laborLearningCurvePercent: number;
  /** Material waste % on takeoff material (before field-supplies adders). */
  materialWastePercent: number;
  /** Consumables / small parts as % of material after waste (caulk, blades, fasteners, etc.). */
  installerFieldSuppliesPercent: number;
  /** Flat allowance for installer consumables ($), added after waste, before field-supplies %. */
  installerFieldSuppliesFlat: number;
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
  /** Overhead % applied to material (tax-inclusive base), not to labor. */
  overheadPercent: number;
  /** Profit % applied after material overhead. */
  profitPercent: number;
  /** Overhead % on subcontractor labor (after labor burden). Defaults to project overhead when unset in DB. */
  laborOverheadPercent: number;
  /** Profit % on subcontractor labor stack. Defaults to project profit when unset in DB. */
  laborProfitPercent: number;
  /** Optional fee (e.g. 5%) on loaded subcontractor labor. */
  subLaborManagementFeeEnabled: boolean;
  subLaborManagementFeePercent: number;
  taxPercent: number;
  pricingMode: PricingMode;
  selectedScopeCategories: string[];
  jobConditions: ProjectJobConditions;
  status: ProjectStatus;
  notes: string | null;
  specialNotes: string | null;
  /** When true, project special notes appear on proposal print/export. */
  proposalIncludeSpecialNotes: boolean;
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
  /** Applied line modifiers (e.g. Recessed); server-computed from line_modifiers_v1, not a DB column on takeoff_lines_v1. */
  modifierNames?: string[];
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

export interface EstimateSummary {
  materialSubtotal: number;
  laborSubtotal: number;
  adjustedLaborSubtotal: number;
  /** Sum of (line labor minutes × qty), adjusted by project labor-hours multiplier (e.g. night work). */
  totalLaborMinutes: number;
  totalLaborHours: number;
  durationDays: number;
  lineSubtotal: number;
  conditionAdjustmentAmount: number;
  conditionLaborMultiplier: number;
  conditionLaborHoursMultiplier: number;
  /** Labor burden $ (subcontractor). */
  burdenAmount: number;
  /** Material overhead $ (not applied to labor). */
  overheadAmount: number;
  /** Material profit $ (not applied to labor). */
  profitAmount: number;
  taxAmount: number;
  /** Labor overhead $ (subcontractor stack). */
  laborOverheadAmount: number;
  /** Labor profit $ (subcontractor stack). */
  laborProfitAmount: number;
  /** Sub labor management / fee $ (e.g. 5% on loaded labor). */
  subLaborManagementFeeAmount: number;
  /** Material + tax + material O&P (sell). */
  materialLoadedSubtotal: number;
  /** Labor after conditions + burden + labor O&P + optional fee (sell). */
  laborLoadedSubtotal: number;
  /** Same as laborLoadedSubtotal; use for a separate labor proposal when pricing mode is material-only. */
  laborCompanionProposalTotal: number;
  baseBidTotal: number;
  conditionAssumptions: string[];
  projectConditions: ProjectConditions;
  /** Productive crew-hours per day (after breaks) used for field-day count. */
  productiveCrewHoursPerDay: number;
  /** $ added for material waste (on raw takeoff material). */
  materialWasteAllowanceAmount: number;
  /** $ added for installer field supplies (flat + % of material after waste). */
  installerFieldSuppliesAmount: number;
  /** Labor $ attributed to learning-curve allowance (before condition multipliers). */
  laborLearningCurveAllowanceAmount: number;
}

export interface InstallReviewEmailDraft {
  subject: string;
  body: string;
  summary: {
    projectName: string;
    location?: string | null;
    timeline?: string | null;
    crewSize?: number | null;
    estimatedHours?: number | null;
    estimatedDays?: number | null;
    materialTotal: number;
    laborTotal: number;
    proposalTotal: number;
    projectConditions: string[];
  };
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
