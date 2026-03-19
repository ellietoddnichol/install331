import type { ExtractedPdfBlock, ExtractedPdfDocument, IntakeProjectMetadata, PdfExtractionProvider } from '../../../shared/types/intake.ts';
import { extractMetadataFromText } from '../metadataExtractorService.ts';

export interface PdfChunk {
  chunkId: string;
  pageNumber: number;
  text: string;
  blockTypes: Array<ExtractedPdfBlock['type']>;
}

export interface PdfParseOutput {
  document: ExtractedPdfDocument;
  chunks: PdfChunk[];
  warnings: string[];
  sourceSummary: {
    fileName: string;
    pagesProcessed: number[];
  };
  metadata: Partial<IntakeProjectMetadata>;
}

function extractPrintableTextFromPdf(buffer: Buffer): string {
  const latin = new TextDecoder('latin1').decode(buffer);
  const extractedByPage = latin
    .split(/\f+/)
    .map((page) => {
      const matches = page.match(/\(([^\)]{2,})\)/g) || [];
      return matches
        .map((token) => token.slice(1, -1))
        .map((token) => token.replace(/\\[rn]/g, ' '))
        .join('\n')
        .trim();
    })
    .filter(Boolean);

  const extracted = extractedByPage.join('\f');
  return extracted || latin;
}

function splitIntoPages(text: string): string[] {
  const explicitPages = text.split(/\f+/).map((page) => page.trim()).filter(Boolean);
  if (explicitPages.length > 1) return explicitPages;

  const lines = text.split(/\r?\n/);
  const pageSize = 80;
  const pages: string[] = [];
  for (let index = 0; index < lines.length; index += pageSize) {
    const pageText = lines.slice(index, index + pageSize).join('\n').trim();
    if (pageText) pages.push(pageText);
  }
  return pages.length ? pages : [text.trim()].filter(Boolean);
}

function classifyBlock(line: string): ExtractedPdfBlock {
  const trimmed = line.trim();
  if (!trimmed) return { type: 'unknown', text: '' };
  if (/^[A-Za-z0-9 .\-\/]+:\s+.+$/.test(trimmed)) return { type: 'kv', text: trimmed, confidence: 0.72 };
  if (/\t|\s{3,}/.test(trimmed)) return { type: 'table', text: trimmed, confidence: 0.6 };
  if (trimmed.length > 120) return { type: 'paragraph', text: trimmed, confidence: 0.58 };
  return { type: 'line', text: trimmed, confidence: 0.66 };
}

export class FallbackPdfExtractionProvider implements PdfExtractionProvider {
  async extract(file: Buffer): Promise<ExtractedPdfDocument> {
    const text = extractPrintableTextFromPdf(file);
    const pages = splitIntoPages(text).map((pageText, index) => ({
      pageNumber: index + 1,
      text: pageText,
      blocks: pageText
        .split(/\r?\n/)
        .map((line) => classifyBlock(line))
        .filter((block) => block.text),
    }));

    return {
      pages,
      documentText: text,
      extractionWarnings: text.trim() ? [] : ['PDF fallback extraction returned no readable text.'],
    };
  }
}

function chunkPdfDocument(document: ExtractedPdfDocument): PdfChunk[] {
  const chunks: PdfChunk[] = [];
  document.pages.forEach((page) => {
    let currentLines: string[] = [];
    let currentTypes: Array<ExtractedPdfBlock['type']> = [];
    let currentLength = 0;
    let chunkIndex = 0;

    page.blocks.forEach((block) => {
      const nextLength = currentLength + block.text.length + 1;
      if (currentLines.length > 0 && nextLength > 2200) {
        chunks.push({
          chunkId: `page-${page.pageNumber}-chunk-${chunkIndex + 1}`,
          pageNumber: page.pageNumber,
          text: currentLines.join('\n'),
          blockTypes: Array.from(new Set(currentTypes)),
        });
        currentLines = [];
        currentTypes = [];
        currentLength = 0;
        chunkIndex += 1;
      }
      currentLines.push(block.text);
      currentTypes.push(block.type);
      currentLength = nextLength;
    });

    if (currentLines.length > 0) {
      chunks.push({
        chunkId: `page-${page.pageNumber}-chunk-${chunkIndex + 1}`,
        pageNumber: page.pageNumber,
        text: currentLines.join('\n'),
        blockTypes: Array.from(new Set(currentTypes)),
      });
    }
  });

  return chunks;
}

function getPdfExtractionProvider(): PdfExtractionProvider {
  const provider = String(process.env.UPLOAD_PDF_PROVIDER || 'fallback-text').toLowerCase();
  if (provider === 'google-document-ai' || provider === 'azure-document-intelligence') {
    // TODO: wire external PDF extraction providers using service credentials.
    return new FallbackPdfExtractionProvider();
  }
  return new FallbackPdfExtractionProvider();
}

export async function parsePdfUpload(input: { fileName: string; mimeType: string; dataBase64: string }): Promise<PdfParseOutput> {
  const provider = getPdfExtractionProvider();
  const document = await provider.extract(Buffer.from(input.dataBase64, 'base64'));
  const chunks = chunkPdfDocument(document);
  const warnings = [...document.extractionWarnings];
  if (!chunks.length) warnings.push('No PDF chunks were produced for normalization.');

  return {
    document,
    chunks,
    warnings,
    sourceSummary: {
      fileName: input.fileName,
      pagesProcessed: document.pages.map((page) => page.pageNumber),
    },
    metadata: extractMetadataFromText(document.documentText),
  };
}