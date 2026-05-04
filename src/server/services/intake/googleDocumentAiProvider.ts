import { DocumentProcessorServiceClient, protos } from '@google-cloud/documentai';
import type { ExtractedPdfBlock, ExtractedPdfDocument, PdfExtractionProvider } from '../../../shared/types/intake.ts';
import { stripIntakeControlCharacters } from '../../../shared/utils/intakeTextGuards.ts';

const DOCUMENT_AI_LOCATION = 'us';

type TextAnchor = protos.google.cloud.documentai.v1.Document.ITextAnchor | null | undefined;
type Page = protos.google.cloud.documentai.v1.Document.IPage;

function intFromIndex(value: unknown, fallback: number): number {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'number') return Number.isFinite(value) ? value : fallback;
  const n = parseInt(String(value), 10);
  return Number.isFinite(n) ? n : fallback;
}

function textFromAnchor(fullText: string, anchor?: TextAnchor): string {
  if (!anchor?.textSegments?.length || !fullText) return '';
  let out = '';
  for (const seg of anchor.textSegments) {
    const start = intFromIndex(seg.startIndex, 0);
    const end = intFromIndex(seg.endIndex, fullText.length);
    if (end > start) out += fullText.slice(start, end);
  }
  return out;
}

function blocksFromPage(fullText: string, page: Page): ExtractedPdfBlock[] {
  const blocks: ExtractedPdfBlock[] = [];

  for (const table of page.tables || []) {
    const t = textFromAnchor(fullText, table.layout?.textAnchor).trim();
    if (t) blocks.push({ type: 'table', text: t, confidence: 0.75 });
  }

  for (const para of page.paragraphs || []) {
    const t = textFromAnchor(fullText, para.layout?.textAnchor).trim();
    if (t) blocks.push({ type: 'paragraph', text: t, confidence: 0.7 });
  }

  if (!blocks.length) {
    for (const line of page.lines || []) {
      const t = textFromAnchor(fullText, line.layout?.textAnchor).trim();
      if (t) blocks.push({ type: 'line', text: t, confidence: 0.65 });
    }
  }

  if (!blocks.length) {
    for (const block of page.blocks || []) {
      const t = textFromAnchor(fullText, block.layout?.textAnchor).trim();
      if (t) blocks.push({ type: 'unknown', text: t, confidence: 0.55 });
    }
  }

  return blocks;
}

function pageTextFromLayout(fullText: string, page: Page): string {
  const fromPage = textFromAnchor(fullText, page.layout?.textAnchor).trim();
  if (fromPage) return stripIntakeControlCharacters(fromPage);

  const lines = (page.lines || []).map((l) => textFromAnchor(fullText, l.layout?.textAnchor).trim()).filter(Boolean);
  if (lines.length) return stripIntakeControlCharacters(lines.join('\n'));

  const paras = (page.paragraphs || []).map((p) => textFromAnchor(fullText, p.layout?.textAnchor).trim()).filter(Boolean);
  if (paras.length) return stripIntakeControlCharacters(paras.join('\n\n'));

  return '';
}

export class GoogleDocumentAiProvider implements PdfExtractionProvider {
  async extract(file: Buffer): Promise<ExtractedPdfDocument> {
    const projectId = String(process.env.GOOGLE_CLOUD_PROJECT_ID || '').trim();
    const processorId = String(process.env.DOCUMENT_AI_PROCESSOR_ID || '').trim();
    if (!projectId || !processorId) {
      throw new Error(
        'Google Document AI requires GOOGLE_CLOUD_PROJECT_ID and DOCUMENT_AI_PROCESSOR_ID. Use Application Default Credentials (e.g. GOOGLE_APPLICATION_CREDENTIALS).'
      );
    }

    const name = processorId.includes('/processors/')
      ? processorId
      : `projects/${projectId}/locations/${DOCUMENT_AI_LOCATION}/processors/${processorId}`;

    const client = new DocumentProcessorServiceClient({
      apiEndpoint: `${DOCUMENT_AI_LOCATION}-documentai.googleapis.com`,
    });

    const [result] = await client.processDocument({
      name,
      rawDocument: {
        content: file,
        mimeType: 'application/pdf',
      },
    });

    const doc = result.document;
    const rawFull = String(doc?.text ?? '');
    const documentText = stripIntakeControlCharacters(rawFull).trim();
    const extractionWarnings: string[] = [];

    if (!documentText) {
      extractionWarnings.push('Document AI returned no document text for this PDF.');
    }

    const pagesIn = doc?.pages || [];
    const pages =
      pagesIn.length > 0
        ? pagesIn.map((page, index) => {
            const pageNumber = Number(page.pageNumber) || index + 1;
            let text = pageTextFromLayout(rawFull, page);
            let blocks = blocksFromPage(rawFull, page);
            if (!text && blocks.length) {
              text = stripIntakeControlCharacters(blocks.map((b) => b.text).join('\n'));
            }
            if (!blocks.length && text) {
              blocks = text
                .split(/\r?\n/)
                .map((line) => line.trim())
                .filter(Boolean)
                .map((line) => ({ type: 'line' as const, text: line, confidence: 0.6 }));
            }
            return { pageNumber, text, blocks };
          })
        : documentText
          ? [
              {
                pageNumber: 1,
                text: documentText,
                blocks: documentText
                  .split(/\r?\n/)
                  .map((line) => line.trim())
                  .filter(Boolean)
                  .map((line) => ({ type: 'line' as const, text: line, confidence: 0.6 })),
              },
            ]
          : [];

    return {
      pages,
      documentText,
      extractionWarnings,
      pdfFileInfo: undefined,
    };
  }
}
