import type { ClassifyIntakeLineOutput } from '../schemas/div10Brain/aiOutputs.ts';

export type IntakeSourceType = 'spreadsheet' | 'pdf' | 'document';

export type UploadFileType = 'excel' | 'pdf' | 'csv' | 'unknown';

export type UploadParseStatus = 'success' | 'review_required' | 'manual_template_required' | 'failed';

export type IntakeSourceKind =
  | 'spreadsheet-row'
  | 'spreadsheet-matrix'
  | 'spreadsheet-mixed'
  | 'spreadsheet-unstructured'
  | 'pdf-document'
  | 'text-document'
  | 'semi-structured-text';

export type IntakeMatchConfidence = 'strong' | 'possible' | 'none';

export type IntakeMatchStatus = 'matched' | 'suggested' | 'needs_match';

export type CatalogMatchMethod = 'exact' | 'alias' | 'model' | 'dimension' | 'fuzzy' | 'unmatched';

export interface MatrixItemHeader {
  columnIndex: number;
  columnLetter: string;
  rawHeader: string;
}

export interface CatalogMatchCandidate {
  catalogItemId?: string | null;
  matchedName?: string | null;
  description?: string | null;
  sku?: string | null;
  category?: string | null;
  unit?: string | null;
  manufacturer?: string | null;
  model?: string | null;
  materialCost?: number | null;
  laborMinutes?: number | null;
  matchMethod: CatalogMatchMethod;
  confidence: number;
  reasons: string[];
  parsedFamily?: string | null;
  parsedModelTokens?: string[];
  parsedDimensions?: number[];
  familyOnly?: boolean;
  catalogCoverageGap?: boolean;
}

export interface UploadSourceRef {
  fileName: string;
  sheetName?: string;
  rowNumber?: number;
  sourceColumn?: string;
  pageNumber?: number;
  chunkId?: string;
}

export interface ExtractedSpreadsheetRow {
  sourceSheet: string;
  sourceSheetHidden: boolean;
  sourceRowNumber: number;
  sourceColumn?: string;
  rawRow: Record<string, unknown>;
  rawHeader?: string | null;
  normalizedSearchText?: string | null;
  parsedTokens?: string[];
  structureType?: 'flat' | 'matrix';
  catalogMatchCandidates?: CatalogMatchCandidate[];
  mappedFields: {
    roomName?: string;
    itemDescription?: string;
    quantity?: number | null;
    unit?: string | null;
    manufacturer?: string | null;
    model?: string | null;
    finish?: string | null;
    notes?: string | null;
    cost?: number | null;
  };
  parsingNotes: string[];
}

export interface ExtractedPdfBlock {
  type: 'paragraph' | 'table' | 'line' | 'kv' | 'unknown';
  text: string;
  bbox?: number[];
  confidence?: number;
}

export interface ExtractedPdfPage {
  pageNumber: number;
  text: string;
  blocks: ExtractedPdfBlock[];
}

export interface ExtractedPdfDocument {
  pages: ExtractedPdfPage[];
  documentText: string;
  extractionWarnings: string[];
  /** Populated when using pdf.js-based extraction (e.g. pdf-parse). */
  pdfFileInfo?: Record<string, unknown>;
}

export interface PdfExtractionProvider {
  extract(file: Buffer): Promise<ExtractedPdfDocument>;
}

export interface NormalizedIntakeItem {
  sourceType: 'excel' | 'pdf' | 'csv';
  sourceRef: UploadSourceRef;
  itemType: string | null;
  category: string | null;
  roomName: string | null;
  description: string;
  quantity: number | null;
  unit: string | null;
  manufacturer: string | null;
  model: string | null;
  finish: string | null;
  modifiers: string[];
  bundleCandidates: string[];
  notes: string[];
  alternate: boolean;
  exclusion: boolean;
  confidence: number;
  rawHeader?: string | null;
  normalizedSearchText?: string | null;
  parsedTokens?: string[];
  structureType?: 'flat' | 'matrix';
  catalogMatchCandidates?: CatalogMatchCandidate[];
  reviewRequired?: boolean;
  /** Parser-derived flags (e.g. field_assembly, finish_modifier) for review and estimating. */
  semanticTags?: string[];
  /** Manufacturer carried from the nearest `Brand - Category - Bucket` section header. */
  sourceManufacturer?: string;
  /** Bid bucket carried from the nearest section header (e.g. `Base Bid`, `Alt 1`). */
  sourceBidBucket?: string;
  /** Raw section header text (e.g. `Scranton - Toilet Partitions - Base Bid`). */
  sourceSectionHeader?: string;
  /** Physically-installable scope flag derived from installabilityRules.ts. */
  isInstallableScope?: boolean;
  /** Normalized install scope type key (e.g. `partition_hdpe_compartment`). */
  installScopeType?: string | null;
}

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  correctedItems?: NormalizedIntakeItem[];
}

export interface ParseConfidenceSummary {
  overallConfidence: number;
  itemConfidenceAverage: number;
  lowConfidenceItems: string[];
  recommendedAction: 'auto-import' | 'review-before-import' | 'manual-template';
}

export interface UploadParseResult {
  status: UploadParseStatus;
  fileType: UploadFileType;
  extractedItems: NormalizedIntakeItem[];
  validation: ValidationResult;
  confidence: ParseConfidenceSummary;
  parseWarnings: string[];
  sourceSummary: {
    fileName: string;
    sheetsProcessed?: string[];
    pagesProcessed?: number[];
  };
  parserMetadata: {
    originalFileName: string;
    mimeType: string;
    uploadedAt: string;
    fileSize: number;
    parserStrategy: string;
    parseStatus: UploadParseStatus;
    confidenceScore: number;
    warnings: string[];
    errors: string[];
  };
}

export type IntakeAssumptionKind =
  | 'pricing_basis'
  | 'tax'
  | 'delivery'
  | 'bond'
  | 'shipment'
  | 'site_visit'
  | 'alternate'
  | 'clarification'
  | 'exclusion'
  | 'other';

export interface IntakeParseRequest {
  fileName: string;
  mimeType: string;
  sourceType?: IntakeSourceType;
  dataBase64?: string;
  extractedText?: string;
  matchCatalog?: boolean;
}

export interface IntakeProjectAssumption {
  kind: IntakeAssumptionKind;
  text: string;
  confidence: number;
}

export interface IntakeProjectMetadata {
  projectName: string;
  projectNumber: string;
  bidPackage?: string;
  client: string;
  generalContractor: string;
  address: string;
  bidDate: string;
  proposalDate: string;
  estimator: string;
  sourceFiles: string[];
  assumptions: IntakeProjectAssumption[];
  pricingBasis: '' | 'material_only' | 'labor_only' | 'labor_and_material' | 'material_with_optional_install_quote';
  confidence: number;
  sources: string[];
}

export interface IntakeCatalogMatch {
  catalogItemId: string;
  sku: string;
  description: string;
  category: string;
  unit: string;
  materialCost: number;
  laborMinutes: number;
  score: number;
  confidence: IntakeMatchConfidence;
  reason: string;
}

export interface IntakeBundleMatch {
  bundleId: string;
  bundleName: string;
  category: string | null;
  score: number;
  confidence: IntakeMatchConfidence;
  reason: string;
}

export type IntakeScopeBucket =
  | 'priced_base_scope'
  | 'line_condition'
  | 'project_condition'
  | 'deduction_alternate'
  | 'excluded_by_others'
  | 'allowance'
  | 'informational_only'
  | 'unknown';

/** Review / correction workflow state for matcher output (not persisted until UI writes back). */
export type IntakeApplicationStatus = 'suggested' | 'accepted' | 'replaced' | 'ignored';

/** Catalog auto-apply policy tier for intake / estimate review (company settings control server behavior). */
export type IntakeCatalogAutoApplyTier = 'A' | 'B' | 'C';

/** Division 10 bid-reasoning: document block classification (debug + routing). */
export type IntakeParserBlockType =
  | 'company_header'
  | 'proposal_metadata'
  | 'scope_header'
  | 'scope_item'
  | 'scope_option'
  | 'subtotal'
  | 'commercial_term'
  | 'inclusion_note'
  | 'unknown';

export type IntakeExtractionBucket =
  | 'scope'
  | 'commercial_term'
  | 'alternate'
  | 'assumption_signal'
  | 'exclusion'
  | 'hidden_scope_signal'
  | 'unknown';

export type IntakeProposalScopeTypeHint = 'material_only' | 'install_only' | 'material_and_install' | 'unknown';

/** Structured reasoning attached to intake lines (and discarded-line debug snapshots). */
export interface IntakeReasoningConfidenceAdjustments {
  /** Subtract from line confidence (0–1 scale), e.g. 0.1 = −10 points. */
  lineConfidencePenalty: number;
  /** Additional penalty toward scope completeness (0–1). */
  scopeCompletenessPenalty: number;
  /** 0–100, higher = more hidden-scope / field-verify risk. */
  hiddenScopeRiskScore: number;
  needsSpecCrosscheck: boolean;
  /** Human-readable document-level bump labels applied to this line text. */
  document_bump_labels?: string[];
}

export interface IntakeReasoningEnvelope {
  parser_block_type: IntakeParserBlockType;
  /** Model bucket when present; local heuristics may set `unknown`. */
  extraction_bucket?: IntakeExtractionBucket;
  install_object_ids?: string[];
  /** Normalized intents from construction_semantics + install_objects (e.g. locker_base_carpentry). */
  install_intelligence_tags?: string[];
  hidden_scope_tags?: string[];
  labor_recipe_candidates?: string[];
  recommended_questions_internal?: string[];
  crew_bump_signals?: string[];
  crew_recommendation?: {
    /** Internal install_family key (e.g. locker_system). */
    install_family?: string;
    /** Human-readable family label from crew suggestion rules. */
    install_family_display_name?: string;
    /** Baseline crew from family rules (not quantity-driven). */
    default_crew?: number;
    /** After bump triggers; same as suggested_crew_size when both set. */
    recommended_crew?: number;
    /** @deprecated Prefer recommended_crew — kept for older clients. */
    suggested_crew_size?: number;
    bump_factors?: string[];
    /** Structured trigger ids that increased crew (e.g. tile_or_cmu_drilling). */
    crew_bump_factor_ids?: string[];
    reasoning?: string;
  };
  /** 0–1 rolled up after penalties (for UI / automation). */
  reasoning_confidence?: number;
  non_scope_meaning?: {
    proposal_scope_type?: IntakeProposalScopeTypeHint;
    logistics_flags?: string[];
    commercial_flags?: string[];
  };
  confidence_adjustments?: IntakeReasoningConfidenceAdjustments;
  /** Gemini / local classifier rationale (short). */
  classification_rationale?: string;
}

/** Lines classified as non-scope but kept for debugging (parser_block_type + drop reason). */
export interface IntakeDiscardedLineSnapshot {
  descriptionPreview: string;
  parser_block_type: IntakeParserBlockType;
  dropReason: string;
  reasoning?: IntakeReasoningEnvelope;
}

export interface IntakeReviewLine {
  lineId: string;
  /** Stable content key for reorder-safe correction logging and estimate draft rows. */
  reviewLineFingerprint: string;
  /** Stable when quantity or unit drifts on re-parse; used with durable “Ignore” rows. */
  reviewLineContentKey: string;
  /** Matcher tier: A = eligible for auto-link / pre-accept, B = suggest, C = needs work. */
  catalogAutoApplyTier?: IntakeCatalogAutoApplyTier;
  /** True when server auto-linked catalog (Tier A + auto_link_tier_a mode). */
  catalogAutoLinked?: boolean;
  roomName: string;
  itemName: string;
  description: string;
  category: string;
  itemCode: string;
  quantity: number;
  unit: string;
  notes: string;
  sourceReference: string;
  laborIncluded: boolean | null;
  materialIncluded: boolean | null;
  confidence: number;
  completeness: 'complete' | 'partial';
  matchStatus: IntakeMatchStatus;
  matchedCatalogItemId: string | null;
  matchExplanation: string;
  catalogMatch: IntakeCatalogMatch | null;
  suggestedMatch: IntakeCatalogMatch | null;
  /** Strong alignment with a catalog bundle (room + scope vs bundle name/category). */
  bundleMatch: IntakeBundleMatch | null;
  /** Weaker bundle candidate for review. */
  suggestedBundle: IntakeBundleMatch | null;
  warnings: string[];
  semanticTags?: string[];
  /** Division 10 bid reasoning + install intelligence (structured). */
  reasoning?: IntakeReasoningEnvelope;
  /** Manufacturer carried from the nearest `Brand - Category - Bucket` section header. */
  sourceManufacturer?: string;
  /** Bid bucket carried from the nearest section header (e.g. `Base Bid`, `Alt 1`). */
  sourceBidBucket?: string;
  /** Raw section header text (e.g. `Scranton - Toilet Partitions - Base Bid`). */
  sourceSectionHeader?: string;
  /** True when the line describes physically-installable scope (partition, grab bar, mirror, etc.). */
  isInstallableScope?: boolean;
  /** Normalized install scope type key (e.g. `partition_hdpe_compartment`, `grab_bar_18`). */
  installScopeType?: string | null;
  /** Install labor family fallback when catalog matching did not provide usable labor. */
  installFamilyFallback?: {
    key: string;
    minutes: number;
    basis: string;
  } | null;
}

export interface IntakeRoomCandidate {
  roomName: string;
  sourceReference: string;
  lineCount: number;
  confidence: number;
}

export interface IntakeProposalAssist {
  introDraft: string;
  scopeSummaryDraft: string;
  clarificationsDraft: string;
  exclusionsDraft: string;
}

export interface IntakeConfidenceSummary {
  metadata: number;
  lineExtraction: number;
  matching: number;
  overall: number;
}

export interface IntakeParseDiagnostics {
  parserStrategy: string;
  parseStrategy: string;
  sourceKind: IntakeSourceKind;
  metadataSources: string[];
  metadataFound: string[];
  metadataMissing: string[];
  warnings: string[];
  totalLines: number;
  completeLines: number;
  matchedLines: number;
  needsMatchLines: number;
  modelUsed: string;
  confidenceSummary: IntakeConfidenceSummary;
  confidenceNarrative: string;
  webEnrichmentUsed: boolean;
}

/** Project-level condition hint from the AI classification pass (validated against DB in later phases). */
export interface IntakeAiProjectModifierHint {
  phrase: string;
  confidence: number;
  rationale: string;
  evidenceText: string;
}

/** @deprecated Use IntakeAiProjectModifierHint */
export type IntakeAiGlobalModifierHint = IntakeAiProjectModifierHint;

/** Per-line ontology hints from Gemini structured output — for review UI and future matcher validation. */
export interface IntakeAiLineClassification {
  lineIndex: number;
  descriptionPreview: string;
  documentLineKind: string;
  pricingRole: string;
  scopeTarget: string;
  costDriver: string;
  applicationMethod: string;
  lineConfidence: number;
  rationale: string;
  evidenceText: string;
  requiresGrounding: boolean;
  lineKindLegacy?: string;
}

/**
 * Decision-layer output: document + line ontology separate from raw extraction.
 * Populated when intake uses Gemini structured extraction; not DB-validated yet.
 */
export interface IntakeAiSuggestions {
  documentType: string;
  pricingModeSuggested:
    | ''
    | 'material_only'
    | 'labor_only'
    | 'labor_and_material'
    | 'material_with_optional_install_quote';
  documentConfidence: number;
  documentRationale: string;
  documentEvidence: string;
  /** Project-wide conditions (night work, prevailing wage, etc.) — not line-level assembly. */
  suggestedProjectModifierHints: IntakeAiProjectModifierHint[];
  requiresGrounding: string[];
  lineClassifications: IntakeAiLineClassification[];
}

/** Read-only pricing draft from Pass 2–3 (catalog + modifier suggestions). */
/** Div 10 Brain (Supabase + retrieval) — advisory only; does not replace deterministic matcher or pricing. */
export interface Div10LineBrainEvidence {
  classify?: ClassifyIntakeLineOutput | null;
  retrieval?: Array<{ id: string; source_label: string; text: string; score: number }>;
  catalogAssist?: {
    rationale: string;
    confidence: string;
    selected_catalog_item_id: string | null;
    alternate_catalog_item_ids: string[];
    needs_human_review: boolean;
  } | null;
  modifierAssist?: {
    suggested_line_modifier_keys: string[];
    suggested_project_modifier_keys: string[];
    line_modifier_ids_resolved: string[];
    project_modifier_ids_resolved: string[];
    confidence_notes: string;
    needs_human_review: boolean;
  } | null;
  /** Populated when Div 10 enrichment failed for this line (partial failure). */
  div10Error?: string;
}

export interface IntakeProposalClauseHint {
  id: string;
  clause_type: string;
  title: string | null;
  body_preview: string;
}

export interface IntakeLineEstimateSuggestion {
  reviewLineFingerprint: string;
  reviewLineContentKey: string;
  lineId: string;
  scopeBucket: IntakeScopeBucket;
  applicationStatus: IntakeApplicationStatus;
  /** Mirrors intake review line tier for UI badges and bulk actions. */
  catalogAutoApplyTier?: IntakeCatalogAutoApplyTier;
  topCatalogCandidates: IntakeCatalogMatch[];
  suggestedCatalogItemId: string | null;
  /** Line-level modifiers (field conditions, finish, etc.). */
  suggestedLineModifierIds: string[];
  /** Project-level modifiers suggested for this line’s context (same IDs may repeat across lines). */
  suggestedProjectModifierIds: string[];
  matcherSignals: string[];
  marketingNotes: string[];
  pricingPreview: {
    materialEach: number;
    laborMinutesEach: number;
    qty: number;
    /** When true, the labor minutes came from a generic install-labor-family default rather than
     *  a catalog SKU or source-priced labor line. */
    laborFromInstallFamily?: boolean;
    /** The install-labor-family key used (e.g. `partition_compartment`, `grab_bar_36`). */
    installFamilyKey?: string | null;
    /** Source of material pricing: `source` means the vendor quote, `catalog` means seeded catalog,
     *  null when unknown. */
    materialOrigin?: 'source' | 'catalog' | null;
  } | null;
  /** Labor pricing origin: where the labor minutes above came from. */
  laborOrigin?: 'source' | 'catalog' | 'install_family' | null;
  /** Copied through from the intake review line so project-creation can persist context. */
  sourceManufacturer?: string | null;
  sourceBidBucket?: string | null;
  sourceSectionHeader?: string | null;
  isInstallableScope?: boolean | null;
  installScopeType?: string | null;
  /**
   * Strong explicit attribute inference (e.g. "matte black", "recessed", "KD") when the matched
   * catalog item has the corresponding active attribute. Carried into takeoff-line snapshots for
   * new work; older jobs are not rewritten.
   */
  inferredCatalogAttributeSnapshot?: Array<{
    attributeType: 'finish' | 'coating' | 'grip' | 'mounting' | 'assembly';
    attributeValue: string;
    source: 'inferred';
    reason: string;
  }> | null;
  /** Optional Div 10 Brain layer (classify / retrieval / catalog assist / modifier assist). */
  div10Brain?: Div10LineBrainEvidence;
}

/** Project-level job-condition suggestions (toggles), distinct from catalog modifier IDs. */
export interface IntakeSuggestedJobConditionPatch {
  id: string;
  label: string;
  suggestedState: boolean;
  reason?: string;
  applicationStatus: IntakeApplicationStatus;
}

export interface IntakeProjectEstimateSuggestion {
  applicationStatus: IntakeApplicationStatus;
  suggestedProjectModifierIds: string[];
  marketingNotes: string[];
  /** Derived from AI / matcher; empty when not available. */
  suggestedJobConditionsPatch?: IntakeSuggestedJobConditionPatch[];
}

export interface IntakeEstimateDraft {
  version: 1;
  readonly: true;
  generatedAt: string;
  lineSuggestions: IntakeLineEstimateSuggestion[];
  projectSuggestion: IntakeProjectEstimateSuggestion;
}

export interface IntakeParseResult {
  status?: UploadParseStatus;
  fileType?: UploadFileType;
  extractedItems?: NormalizedIntakeItem[];
  validation?: ValidationResult;
  confidence?: ParseConfidenceSummary;
  parseWarnings?: string[];
  sourceSummary?: {
    fileName: string;
    sheetsProcessed?: string[];
    pagesProcessed?: number[];
  };
  sourceType: IntakeSourceType;
  sourceKind: IntakeSourceKind;
  project: IntakeProjectMetadata;
  projectMetadata: IntakeProjectMetadata;
  rooms: IntakeRoomCandidate[];
  parsedLines: IntakeReviewLine[];
  reviewLines: IntakeReviewLine[];
  warnings: string[];
  diagnostics: IntakeParseDiagnostics;
  proposalAssist: IntakeProposalAssist;
  /** Optional AI decision layer (ontology + rationale); present when Gemini returned extended fields. */
  aiSuggestions?: IntakeAiSuggestions;
  /** Retrieved proposal clause snippets (Div 10 Brain); advisory for proposal tab. */
  div10ProposalClauseHints?: IntakeProposalClauseHint[];
  /** Matcher + read-only pricing preview; omitted when catalog matching is disabled. */
  estimateDraft?: IntakeEstimateDraft;
  /** Non-scope lines dropped before review (parser classification for debugging). */
  discardedLineSnapshots?: IntakeDiscardedLineSnapshot[];
}