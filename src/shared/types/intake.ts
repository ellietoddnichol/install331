export type IntakeSourceType = 'spreadsheet' | 'pdf' | 'document';

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
  warnings: string[];
  totalLines: number;
  completeLines: number;
  matchedLines: number;
  needsMatchLines: number;
  modelUsed: string;
  confidenceSummary: IntakeConfidenceSummary;
  webEnrichmentUsed: boolean;
}

export interface IntakeParseResult {
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