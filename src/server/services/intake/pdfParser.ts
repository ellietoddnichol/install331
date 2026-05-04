// Import implementation directly — package `index.js` runs a debug harness when `module.parent` is unset under ESM.
import pdfParse from 'pdf-parse/lib/pdf-parse.js';
import type { ExtractedPdfBlock, ExtractedPdfDocument, IntakeProjectMetadata, PdfExtractionProvider } from '../../../shared/types/intake.ts';
import {
  extractMetadataFromText,
  mergeMetadataHint,
  metadataHintsFromPdfFileInfo,
  stripIntakeControlCharacters,
} from '../metadataExtractorService.ts';
import { GoogleDocumentAiProvider } from './googleDocumentAiProvider.ts';

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
  // Never return raw `latin` — it is the entire PDF file as bytes interpreted as Latin-1,
  // which floods metadata heuristics with binary garbage (e.g. fake "project titles").
  return extracted.trim() ? extracted : '';
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

/** Word/Acrobat-exported PDFs: decode real text streams via pdf.js (pdf-parse). */
async function tryExtractWithPdfParse(buffer: Buffer): Promise<ExtractedPdfDocument | null> {
  try {
    const data = await pdfParse(buffer, { max: 0 });
    const rawText = String(data.text ?? '').replace(/\r\n/g, '\n');
    const text = stripIntakeControlCharacters(rawText).trim();
    if (text.length < 12) return null;

    const pageParts = text.split(/\f+/).map((page) => page.trim()).filter(Boolean);
    const segments = pageParts.length > 0 ? pageParts : [text];
    const pages = segments.map((pageText, index) => ({
      pageNumber: index + 1,
      text: pageText,
      blocks: pageText
        .split(/\n/)
        .map((line) => classifyBlock(line))
        .filter((block) => block.text),
    }));

    return {
      pages,
      documentText: text,
      extractionWarnings: [],
      pdfFileInfo: data.info && typeof data.info === 'object' ? { ...data.info } : undefined,
    };
  } catch {
    return null;
  }
}

export class FallbackPdfExtractionProvider implements PdfExtractionProvider {
  async extract(file: Buffer): Promise<ExtractedPdfDocument> {
    const parsed = await tryExtractWithPdfParse(file);
    if (parsed) return parsed;

    const raw = extractPrintableTextFromPdf(file);
    const text = stripIntakeControlCharacters(raw);
    const pages = splitIntoPages(text).map((pageText, index) => ({
      pageNumber: index + 1,
      text: pageText,
      blocks: pageText
        .split(/\r?\n/)
        .map((line) => classifyBlock(line))
        .filter((block) => block.text),
    }));

    const extractionWarnings: string[] = [];
    if (!raw.trim()) {
      extractionWarnings.push('PDF fallback could not extract text streams (compressed or image-only PDFs need Document AI / export to text).');
    } else if (!text.trim()) {
      extractionWarnings.push('PDF text was only control/binary noise after sanitization.');
    }

    return {
      pages,
      documentText: text,
      extractionWarnings,
      pdfFileInfo: undefined,
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
  if (provider === 'google-document-ai') {
    return new GoogleDocumentAiProvider();
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
    metadata: mergeMetadataHint(
      extractMetadataFromText(document.documentText),
      metadataHintsFromPdfFileInfo(document.pdfFileInfo),
    ),
  };
}