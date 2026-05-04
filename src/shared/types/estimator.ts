import type { IntakeMatchConfidence, IntakeScopeBucket } from './intake.ts';

export type ProjectStatus = 'Draft' | 'Submitted' | 'Awarded' | 'Lost' | 'Archived';

/** Company-wide intake automation: Tier A lines can be auto-linked or pre-accepted in estimate review. */
export type IntakeCatalogAutoApplyMode = 'off' | 'preselect_only' | 'auto_link_tier_a';

/** Machine-readable assumption captured at intake or added later (proposal / overview). */
export interface ProjectStructuredAssumption {
  id: string;
  source: 'intake' | 'peer' | 'manual';
  ruleId?: string;
  text: string;
  confidence: number;
  appliedFields?: string[];
  createdAt: string;
}

export type PricingMode =
  | 'material_only'
  | 'labor_only'
  | 'labor_and_material'
  /**
   * Vendor document is material-only, but install is installable scope.
   * Main bid excludes labor (same math as material_only); the labor stack is
   * generated from catalog / install-family defaults and surfaced as a
   * companion "install quoted separately" proposal.
   */
  | 'material_with_optional_install_quote';

/** True when the main bid total should exclude labor (material_only + material-with-optional-install). */
export function isMaterialOnlyMainBid(mode: PricingMode | string | null | undefined): boolean {
  return mode === 'material_only' || mode === 'material_with_optional_install_quote';
}

/** True when a labor-companion quote should always be surfaced next to the material bid. */
export function hasLaborCompanionQuote(mode: PricingMode | string | null | undefined): boolean {
  return mode === 'material_with_optional_install_quote';
}
export type ProposalFormat = 'standard' | 'condensed' | 'schedule_with_amounts' | 'executive_summary';
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
  locationLabelSource?: 'manual' | 'auto';
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
  /** Performance / surety bond expected on this job (question in setup). */
  performanceBondRequired: boolean;
  /** Percent of base bid (material + labor subtotals before job-wide tax/O&P) included as a bond allowance adder. */
  performanceBondPercent: number;
  estimateAdderPercent: number;
  estimateAdderAmount: number;
  /** Paid hours per installer day; with breaks and non-install time, sets install capacity for calendar duration. */
  installerPaidDayHours: number;
  /** Breaks / lunch per installer day; reduces install capacity for duration (not line $). */
  dailyBreakHoursPerInstaller: number;
  /** Setup, cleanup, layout, tool — not straight install (hr per installer per paid day). Reduces calendar capacity only. */
  fieldSetupCleanupHoursPerInstallerDay: number;
  /** Legacy; not applied in estimate math. */
  laborLearningCurvePercent: number;
  /** Legacy; not applied in estimate math. */
  materialWastePercent: number;
  /** Legacy; not applied in estimate math. */
  installerFieldSuppliesPercent: number;
  /** Legacy; not applied in estimate math. */
  installerFieldSuppliesFlat: number;
}

/** Suggested field values from a past project with the same client or GC (intake helper). */
export interface PeerIntakeDefaultsResponse {
  sourceProjectId: string | null;
  matchedBy: 'client' | 'general_contractor' | null;
  jobConditions: ProjectJobConditions | null;
  selectedScopeCategories: string[] | null;
  pricingMode: PricingMode | null;
  taxPercent: number | null;
}

export interface ProjectRecord {
  id: string;
  projectNumber: string | null;
  projectNumberSource?: 'manual' | 'auto';
  projectName: string;
  clientName: string | null;
  clientNameSource?: 'manual' | 'auto';
  generalContractor: string | null;
  estimator: string | null;
  bidDate: string | null;
  proposalDate: string | null;
  dueDate: string | null;
  address: string | null;
  addressSource?: 'manual' | 'auto';
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
  /** When true, matched catalog product images appear next to scope lines on the proposal. */
  proposalIncludeCatalogImages: boolean;
  /** Client-facing proposal layout (preview / print). */
  proposalFormat: ProposalFormat;
  /** Intake / automation assumptions for estimators and proposal text. */
  structuredAssumptions: ProjectStructuredAssumption[];
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

/** Aggregated line_modifiers_v1 for a takeoff line (enriched in listTakeoffLine APIs, not a DB column). */
export interface TakeoffLineModifierRollup {
  count: number;
  addMaterialCost: number;
  addLaborMinutes: number;
  /** True when any applied modifier uses % material or % labor. */
  hasPercentAdjustments: boolean;
}

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
  /** Intake classifier bucket persisted when lines are created from intake finalize. */
  intakeScopeBucket?: IntakeScopeBucket | null;
  /** Intake catalog shortlist confidence for the linked catalog id when known. */
  intakeMatchConfidence?: IntakeMatchConfidence | null;
  /** Manufacturer carried from the nearest `Brand - Category - Bucket` section header at intake. */
  sourceManufacturer?: string | null;
  /** Bid bucket carried from the intake section header (e.g. `Base Bid`, `Alt 1`). */
  sourceBidBucket?: string | null;
  /** Raw section header text (e.g. `Scranton - Toilet Partitions - Base Bid`). */
  sourceSectionHeader?: string | null;
  /** True when the line describes physically-installable scope (partition, grab bar, mirror, etc.). */
  isInstallableScope?: boolean | null;
  /** Normalized install scope type key (e.g. `partition_hdpe_compartment`, `grab_bar_18`). */
  installScopeType?: string | null;
  /** Resolved install-labor family key (e.g. `partition_compartment`, `grab_bar_36`) used to seed default minutes when catalog labor is absent or zero. */
  installLaborFamily?: string | null;
  /** Raw material cost from the source document when distinct from the catalog/generated material cost. */
  sourceMaterialCost?: number | null;
  /** App-generated install minutes (from catalog or install-family fallback). */
  generatedLaborMinutes?: number | null;
  /** How labor minutes were resolved: `source` = from vendor quote, `catalog` = catalog default, `install_family` = install-family fallback. */
  laborOrigin?: 'source' | 'catalog' | 'install_family' | null;
  /** Applied line modifiers (e.g. Recessed); server-computed from line_modifiers_v1, not a DB column on takeoff_lines_v1. */
  modifierNames?: string[];
  /** Count + additive impacts from line_modifiers_v1 (percents flagged separately). */
  lineModifierRollup?: TakeoffLineModifierRollup;

  /**
   * Snapshot of selected or inferred catalog attributes for forward flows.
   * Stored on the takeoff line so historical jobs remain stable even as catalog
   * variants evolve. Not retroactively written for existing lines.
   */
  catalogAttributeSnapshot?: Array<{
    attributeType: 'finish' | 'coating' | 'grip' | 'mounting' | 'assembly';
    attributeValue: string;
    source: 'user' | 'inferred';
  }> | null;

  /**
   * Snapshotted catalog base values used when applying attribute deltas.
   * Written for new lines only; older lines may be null/undefined.
   */
  baseMaterialCostSnapshot?: number | null;
  baseLaborMinutesSnapshot?: number | null;
  /** Per-attribute material delta snapshot, as applied at line creation time. */
  attributeDeltaMaterialSnapshot?: Array<{
    attributeType: 'finish' | 'coating' | 'grip' | 'mounting' | 'assembly';
    attributeValue: string;
    deltaType: 'absolute' | 'percent';
    /** Stored value from catalog_item_attributes (percent is percent points). */
    deltaValue: number;
    /** Applied $ amount at creation (already resolved from base for %). */
    appliedAmount: number;
  }> | null;
  /** Per-attribute labor delta snapshot, as applied at line creation time. */
  attributeDeltaLaborSnapshot?: Array<{
    attributeType: 'finish' | 'coating' | 'grip' | 'mounting' | 'assembly';
    attributeValue: string;
    deltaType: 'minutes' | 'absolute' | 'percent';
    /** Stored value from catalog_item_attributes (percent is percent points). */
    deltaValue: number;
    /** Applied minutes amount at creation (already resolved from base for %). */
    appliedAmount: number;
  }> | null;
  createdAt: string;
  updatedAt: string;
}

export interface ModifierRecord {
  id: string;
  name: string;
  modifierKey: string;
  /** Estimator-facing explanation (ADA, recessed mount, finish upgrade, etc.). */
  description: string;
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
  /** Default labor overhead % on loaded sub labor (after burden). Typical office default 5. */
  defaultLaborOverheadPercent: number;
  proposalIntro: string;
  proposalTerms: string;
  proposalExclusions: string;
  proposalClarifications: string;
  proposalAcceptanceLabel: string;
  /** Intake catalog automation (company-wide). */
  intakeCatalogAutoApplyMode: IntakeCatalogAutoApplyMode;
  /** Minimum catalog match score (0–1) for Tier A auto-link / pre-accept. */
  intakeCatalogTierAMinScore: number;
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
  /** 8 crew-hr per installer-day × crew size, for duration-day count. */
  productiveCrewHoursPerDay: number;
  /** Always zero; legacy field. */
  materialWasteAllowanceAmount: number;
  /** Always zero; legacy field. */
  installerFieldSuppliesAmount: number;
  /** Always zero; legacy field. */
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

export interface DbPersistenceStatusRecord {
  id: 'db';
  /** Effective resolved DB path on the server. */
  dbPath: string;
  /** Persistence mode inferred by server startup. */
  mode: 'local' | 'volume' | 'ephemeral_gcs' | 'ephemeral_supabase' | 'ephemeral';
  gcsBucket: string | null;
  gcsObject: string | null;
  restoreAttemptedAt: string | null;
  restoreStatus: 'not_configured' | 'skipped_existing_db' | 'no_snapshot' | 'restored' | 'failed';
  restoreMessage: string | null;
  lastBackupSuccessAt: string | null;
  lastBackupFailureAt: string | null;
  lastBackupError: string | null;
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
  aliasesSynced: number;
  attributesSynced: number;
  warnings: string[];
}

/** DB-side snapshot for post–CLEAN_ITEMS cutover validation + image-gap triage. */
export interface CatalogCategoryImageGapRow {
  category: string;
  forwardFacingActive: number;
  missingImageUrl: number;
  pctMissingImage: number;
}

export interface CatalogPostCutoverHealthRecord {
  itemsSourceTab: string;
  inventory: { total: number; active: number; inactive: number };
  forwardFacing: {
    count: number;
    missingImageUrl: number;
    missingImageManufacturerBacked: number;
    distinctItemsWithAttributes: number;
  };
  topCategoriesByMissingImage: CatalogCategoryImageGapRow[];
  validationNotes: string[];
  lastCatalogSync: CatalogSyncStatusRecord;
}

export interface ProjectFileRecord {
  id: string;
  projectId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
}
