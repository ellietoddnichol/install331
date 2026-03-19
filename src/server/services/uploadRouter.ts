import { listActiveCatalogItems } from '../repos/catalogRepo.ts';
import type {
  IntakeParseRequest,
  IntakeParseResult,
  IntakeProjectMetadata,
  IntakeSourceKind,
  IntakeSourceType,
  NormalizedIntakeItem,
  UploadFileType,
  UploadParseResult,
  UploadParseStatus,
} from '../../shared/types/intake.ts';
import { classifyIntakeSourceType } from './fileClassifierService.ts';
import { buildParseConfidenceSummary } from './intake/confidence.ts';
import { candidateToIntakeCatalogMatch, enrichItemsWithCatalogMatches } from './intake/catalogMatcher.ts';
import { parseExcelUpload } from './intake/excelParser.ts';
import { normalizePdfChunks, normalizeSpreadsheetRows } from './intake/normalizer.ts';
import { parsePdfUpload } from './intake/pdfParser.ts';
import { validateNormalizedItems } from './intake/validator.ts';
import { buildIntakeDiagnostics } from './intakeDiagnosticsService.ts';
import { buildRoomCandidates, toReviewLines } from './matchPreparationService.ts';
import { mergeResolvedMetadata } from './metadataExtractorService.ts';
import { buildProposalAssist, extractAssumptionsFromText } from './proposalAssistService.ts';
import { parseIntakeRequest } from './intakePipeline.ts';

function detectUploadFileType(fileName: string, mimeType: string): UploadFileType {
  const lowerName = String(fileName || '').toLowerCase();
  const lowerMime = String(mimeType || '').toLowerCase();
  if (lowerName.endsWith('.csv') || lowerMime.includes('csv')) return 'csv';
  if (lowerName.endsWith('.xlsx') || lowerName.endsWith('.xls') || lowerMime.includes('spreadsheet') || lowerMime.includes('excel')) return 'excel';
  if (lowerName.endsWith('.pdf') || lowerMime.includes('pdf')) return 'pdf';
  return 'unknown';
}

function mapUploadFileTypeToIntakeSource(fileType: UploadFileType): IntakeSourceType {
  if (fileType === 'pdf') return 'pdf';
  if (fileType === 'excel' || fileType === 'csv') return 'spreadsheet';
  return 'document';
}

function deriveSourceKind(fileType: UploadFileType, items: NormalizedIntakeItem[]): IntakeSourceKind {
  if (fileType === 'pdf') return 'pdf-document';
  if (fileType === 'excel' || fileType === 'csv') {
    if (items.some((item) => item.structureType === 'matrix')) return 'spreadsheet-matrix';
    const withRooms = items.filter((item) => item.roomName).length;
    return withRooms > 0 ? 'spreadsheet-row' : 'spreadsheet-mixed';
  }
  return 'semi-structured-text';
}

function toLegacyNormalizedLines(items: NormalizedIntakeItem[]) {
  return items.map((item) => ({
    roomName: item.roomName || 'General',
    category: item.category || '',
    itemCode: item.rawHeader || item.model || '',
    itemName: item.description,
    description: item.description,
    quantity: item.quantity ?? 1,
    unit: item.unit || 'EA',
    notes: item.notes.join(' | '),
    sourceReference: [item.sourceRef.fileName, item.sourceRef.sheetName, item.sourceRef.rowNumber, item.sourceRef.sourceColumn, item.sourceRef.pageNumber, item.sourceRef.chunkId].filter(Boolean).join(' / '),
    laborIncluded: null,
    materialIncluded: null,
    confidence: item.confidence,
    parserTag: item.sourceType,
    warnings: (() => {
      const bestCandidate = (item.catalogMatchCandidates || [])[0];
      if (!bestCandidate) return [];
      if (bestCandidate.matchMethod === 'unmatched' || bestCandidate.familyOnly) {
        return bestCandidate.reasons;
      }
      return [];
    })(),
    catalogMatch: (() => {
      const bestCandidate = (item.catalogMatchCandidates || [])[0];
      if (!bestCandidate || bestCandidate.confidence < 0.75) return null;
      return candidateToIntakeCatalogMatch(bestCandidate);
    })(),
    suggestedMatch: (() => {
      const bestCandidate = (item.catalogMatchCandidates || [])[0];
      if (!bestCandidate || bestCandidate.confidence >= 0.75) return null;
      return candidateToIntakeCatalogMatch(bestCandidate);
    })(),
  }));
}

function buildUploadStatus(confidence: ReturnType<typeof buildParseConfidenceSummary>, validationErrors: string[]): UploadParseStatus {
  if (validationErrors.length && confidence.recommendedAction === 'manual-template') return 'manual_template_required';
  if (confidence.recommendedAction === 'manual-template') return 'manual_template_required';
  if (confidence.recommendedAction === 'review-before-import') return 'review_required';
  return 'success';
}

function buildMetadata(input: {
  extractedMetadata: Partial<IntakeProjectMetadata>;
  items: NormalizedIntakeItem[];
  fileName: string;
}): IntakeProjectMetadata {
  const text = input.items.map((item) => `${item.description} ${item.notes.join(' ')}`).join('\n');
  return mergeResolvedMetadata(
    input.extractedMetadata,
    {
      sourceFiles: [input.fileName],
      assumptions: extractAssumptionsFromText(text),
      pricingBasis: '',
    },
    [input.fileName]
  );
}

function toUploadParseResult(input: {
  fileName: string;
  mimeType: string;
  fileType: UploadFileType;
  parserStrategy: string;
  fileSize: number;
  items: NormalizedIntakeItem[];
  warnings: string[];
  validation: ReturnType<typeof validateNormalizedItems>;
  confidence: ReturnType<typeof buildParseConfidenceSummary>;
  sourceSummary: UploadParseResult['sourceSummary'];
}): UploadParseResult {
  const status = buildUploadStatus(input.confidence, input.validation.errors);
  return {
    status,
    fileType: input.fileType,
    extractedItems: input.validation.correctedItems || input.items,
    validation: input.validation,
    confidence: input.confidence,
    parseWarnings: input.warnings,
    sourceSummary: input.sourceSummary,
    parserMetadata: {
      originalFileName: input.fileName,
      mimeType: input.mimeType,
      uploadedAt: new Date().toISOString(),
      fileSize: input.fileSize,
      parserStrategy: input.parserStrategy,
      parseStatus: status,
      confidenceScore: input.confidence.overallConfidence,
      warnings: input.warnings,
      errors: input.validation.errors,
    },
  };
}

function toLegacyIntakeResult(input: {
  request: IntakeParseRequest;
  upload: UploadParseResult;
  extractedMetadata: Partial<IntakeProjectMetadata>;
}): IntakeParseResult {
  const catalog = listActiveCatalogItems();
  const items = input.upload.validation.correctedItems || input.upload.extractedItems;
  const metadata = buildMetadata({ extractedMetadata: input.extractedMetadata, items, fileName: input.request.fileName });
  const reviewLines = toReviewLines(toLegacyNormalizedLines(items), catalog, input.request.matchCatalog !== false);
  const warnings = Array.from(new Set([...input.upload.parseWarnings, ...input.upload.validation.warnings]));
  const sourceKind = deriveSourceKind(input.upload.fileType, items);
  const proposalAssist = buildProposalAssist({
    metadata,
    assumptions: metadata.assumptions,
    lineDescriptions: reviewLines.map((line) => line.description),
  });

  return {
    status: input.upload.status,
    fileType: input.upload.fileType,
    extractedItems: items,
    validation: input.upload.validation,
    confidence: input.upload.confidence,
    parseWarnings: input.upload.parseWarnings,
    sourceSummary: input.upload.sourceSummary,
    sourceType: mapUploadFileTypeToIntakeSource(input.upload.fileType),
    sourceKind,
    project: metadata,
    projectMetadata: metadata,
    rooms: buildRoomCandidates(reviewLines),
    parsedLines: reviewLines,
    reviewLines,
    warnings,
    diagnostics: buildIntakeDiagnostics({
      sourceKind,
      parseStrategy: input.upload.parserMetadata.parserStrategy,
      metadata,
      reviewLines,
      warnings,
      modelUsed: String(process.env.UPLOAD_LLM_NORMALIZATION || 'heuristic+optional-gemini'),
      webEnrichmentUsed: false,
    }),
    proposalAssist,
  };
}

async function parseWithHybridUploadRouter(input: IntakeParseRequest): Promise<{ upload: UploadParseResult; metadata: Partial<IntakeProjectMetadata> }> {
  const fileType = detectUploadFileType(input.fileName, input.mimeType);
  const fileSize = input.dataBase64 ? Buffer.from(input.dataBase64, 'base64').length : 0;

  if ((fileType === 'excel' || fileType === 'csv') && input.dataBase64) {
    const excel = parseExcelUpload({ fileName: input.fileName, mimeType: input.mimeType, dataBase64: input.dataBase64 });
    const catalog = listActiveCatalogItems();
    const items = enrichItemsWithCatalogMatches(
      normalizeSpreadsheetRows({ fileType: excel.fileType, fileName: input.fileName, rows: excel.extractedRows, metadata: excel.metadata }),
      catalog
    );
    const validation = validateNormalizedItems(items);
    const confidence = buildParseConfidenceSummary(validation.correctedItems || items, validation);
    return {
      metadata: excel.metadata,
      upload: toUploadParseResult({
        fileName: input.fileName,
        mimeType: input.mimeType,
        fileType,
        parserStrategy: 'native-excel-first',
        fileSize,
        items,
        warnings: excel.warnings,
        validation,
        confidence,
        sourceSummary: excel.sourceSummary,
      }),
    };
  }

  if (fileType === 'pdf' && input.dataBase64) {
    const pdf = await parsePdfUpload({ fileName: input.fileName, mimeType: input.mimeType, dataBase64: input.dataBase64 });
    const items = await normalizePdfChunks({ fileName: input.fileName, mimeType: input.mimeType, chunks: pdf.chunks });
    const validation = validateNormalizedItems(items);
    const confidence = buildParseConfidenceSummary(validation.correctedItems || items, validation);
    return {
      metadata: pdf.metadata,
      upload: toUploadParseResult({
        fileName: input.fileName,
        mimeType: input.mimeType,
        fileType,
        parserStrategy: `pdf-${String(process.env.UPLOAD_PDF_PROVIDER || 'fallback-text')}`,
        fileSize,
        items,
        warnings: [...pdf.warnings, ...pdf.document.extractionWarnings],
        validation,
        confidence,
        sourceSummary: pdf.sourceSummary,
      }),
    };
  }

  const fallbackItems: NormalizedIntakeItem[] = [];
  const validation = validateNormalizedItems(fallbackItems);
  const confidence = buildParseConfidenceSummary(fallbackItems, validation);
  return {
    metadata: { sourceFiles: [input.fileName], assumptions: [], pricingBasis: '' },
    upload: toUploadParseResult({
      fileName: input.fileName,
      mimeType: input.mimeType,
      fileType,
      parserStrategy: 'unsupported-upload-type',
      fileSize,
      items: fallbackItems,
      warnings: ['Upload type is not supported by the hybrid parser. Falling back to the legacy intake pipeline may be required.'],
      validation,
      confidence,
      sourceSummary: { fileName: input.fileName },
    }),
  };
}

export async function parseUploadedWithRouter(input: IntakeParseRequest): Promise<IntakeParseResult> {
  const explicitType = classifyIntakeSourceType(input.fileName, input.mimeType, input.sourceType);
  if (explicitType === 'document' && !input.fileName.toLowerCase().endsWith('.pdf')) {
    return parseIntakeRequest(input);
  }

  const { upload, metadata } = await parseWithHybridUploadRouter(input);
  if (upload.fileType === 'unknown' || (upload.extractedItems.length === 0 && explicitType === 'document')) {
    return parseIntakeRequest(input);
  }
  return toLegacyIntakeResult({ request: input, upload, extractedMetadata: metadata });
}