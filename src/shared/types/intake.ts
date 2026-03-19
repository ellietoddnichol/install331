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
  pricingBasis: '' | 'material_only' | 'labor_only' | 'labor_and_material';
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

export interface IntakeReviewLine {
  lineId: string;
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
  warnings: string[];
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
}