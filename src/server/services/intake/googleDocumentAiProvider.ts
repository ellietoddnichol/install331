import { DocumentProcessorServiceClient } from '@google-cloud/documentai';
import type { ExtractedPdfBlock, ExtractedPdfDocument, ExtractedPdfPage, PdfExtractionProvider } from '../../../shared/types/intake.ts';

function mapBlockType(type: string | null | undefined): ExtractedPdfBlock['type'] {
  if (!type) return 'unknown';
  const t = type.toLowerCase();
  if (t.includes('table')) return 'table';
  if (t.includes('paragraph') || t.includes('text')) return 'paragraph';
  if (t.includes('line') || t.includes('token')) return 'line';
  if (t.includes('form') || t.includes('key')) return 'kv';
  return 'unknown';
}

function getTextFromLayout(layout: any, fullText: string): string {
  if (!layout?.textAnchor?.textSegments?.length) return '';
  return layout.textAnchor.textSegments
    .map((seg: any) => {
      const start = Number(seg.startIndex ?? 0);
      const end = Number(seg.endIndex ?? 0);
      return fullText.slice(start, end);
    })
    .join('')
    .replace(/\r\n/g, '\n')
    .trim();
}

export class GoogleDocumentAiProvider implements PdfExtractionProvider {
  async extract(file: Buffer): Promise<ExtractedPdfDocument> {
    const projectId = process.env.GOOGLE_CLOUD_PROJECT_ID;
    const processorId = process.env.DOCUMENT_AI_PROCESSOR_ID;

    if (!projectId || !processorId) {
      throw new Error('GOOGLE_CLOUD_PROJECT_ID and DOCUMENT_AI_PROCESSOR_ID environment variables are required for GoogleDocumentAiProvider.');
    }

    const client = new DocumentProcessorServiceClient();
    const processorName = `projects/${projectId}/locations/us/processors/${processorId}`;

    const [result] = await client.processDocument({
      name: processorName,
      rawDocument: {
        content: file.toString('base64'),
        mimeType: 'application/pdf',
      },
    });

    const doc = result.document;
    const fullText = doc?.text ?? '';
    const extractionWarnings: string[] = [];

    if (!fullText.trim()) {
      extractionWarnings.push('Document AI returned no text; the PDF may be image-only or the processor may need configuration.');
    }

    const pageMap = new Map<number, ExtractedPdfPage>();

    const docPages = doc?.pages ?? [];
    docPages.forEach((page: any) => {
      const pageNum = Number(page.pageNumber ?? 1);
      const blocks: ExtractedPdfBlock[] = [];

      const paragraphs: any[] = page.paragraphs ?? [];
      paragraphs.forEach((para: any) => {
        const text = getTextFromLayout(para.layout, fullText);
        if (!text) return;
        blocks.push({
          type: 'paragraph',
          text,
          confidence: para.layout?.confidence ?? undefined,
        });
      });

      const tables: any[] = page.tables ?? [];
      tables.forEach((table: any) => {
        const rows: any[] = [...(table.headerRows ?? []), ...(table.bodyRows ?? [])];
        const rowTexts = rows.map((row: any) => {
          const cells: any[] = row.cells ?? [];
          return cells.map((cell: any) => getTextFromLayout(cell.layout, fullText)).join('\t');
        }).filter(Boolean);
        if (!rowTexts.length) return;
        const text = rowTexts.join('\n');
        blocks.push({
          type: 'table',
          text,
          confidence: table.layout?.confidence ?? undefined,
        });
      });

      const formFields: any[] = page.formFields ?? [];
      formFields.forEach((field: any) => {
        const key = getTextFromLayout(field.fieldName?.layout, fullText);
        const value = getTextFromLayout(field.fieldValue?.layout, fullText);
        if (!key && !value) return;
        const text = key && value ? `${key}: ${value}` : key || value;
        blocks.push({
          type: 'kv',
          text,
          confidence: field.fieldName?.layout?.confidence ?? undefined,
        });
      });

      const pageText = blocks.map((b) => b.text).join('\n');
      pageMap.set(pageNum, { pageNumber: pageNum, text: pageText, blocks });
    });

    // If Document AI returned text but no structured page blocks, fall back to splitting fullText by page.
    if (pageMap.size === 0 && fullText.trim()) {
      const pageParts = fullText.split(/\f+/).map((p) => p.trim()).filter(Boolean);
      const parts = pageParts.length > 0 ? pageParts : [fullText.trim()];
      parts.forEach((pageText, index) => {
        const blocks: ExtractedPdfBlock[] = pageText
          .split(/\n/)
          .map((line): ExtractedPdfBlock => ({ type: 'line', text: line.trim() }))
          .filter((b) => b.text);
        pageMap.set(index + 1, { pageNumber: index + 1, text: pageText, blocks });
      });
    }

    const pages = Array.from(pageMap.values()).sort((a, b) => a.pageNumber - b.pageNumber);
    const documentText = pages.map((p) => p.text).join('\f');

    return {
      pages,
      documentText,
      extractionWarnings,
      pdfFileInfo: undefined,
    };
  }
}
