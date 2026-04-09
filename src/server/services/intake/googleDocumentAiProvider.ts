import { DocumentProcessorServiceClient } from '@google-cloud/documentai';
import type { ExtractedPdfBlock, ExtractedPdfDocument, PdfExtractionProvider } from '../../../shared/types/intake.ts';

function mapConfidence(confidence: number | null | undefined): number | undefined {
  if (confidence == null || !Number.isFinite(confidence)) return undefined;
  return Math.max(0, Math.min(1, confidence));
}

export class GoogleDocumentAiProvider implements PdfExtractionProvider {
  async extract(file: Buffer): Promise<ExtractedPdfDocument> {
    const projectId = process.env.GOOGLE_CLOUD_PROJECT_ID;
    const processorId = process.env.DOCUMENT_AI_PROCESSOR_ID;

    if (!projectId || !processorId) {
      throw new Error('GOOGLE_CLOUD_PROJECT_ID and DOCUMENT_AI_PROCESSOR_ID environment variables are required for Google Document AI.');
    }

    const client = new DocumentProcessorServiceClient();
    const processorName = `projects/${projectId}/locations/us/processors/${processorId}`;

    const [result] = await client.processDocument({
      name: processorName,
      rawDocument: {
        content: file,
        mimeType: 'application/pdf',
      },
    });

    const doc = result.document;
    if (!doc) {
      return { pages: [], documentText: '', extractionWarnings: ['Document AI returned no document.'] };
    }

    const fullText = doc.text ?? '';
    const extractionWarnings: string[] = [];

    const docPages = doc.pages ?? [];
    const pages = docPages.map((page) => {
      const pageNumber = (page.pageNumber ?? 1);
      const blocks: ExtractedPdfBlock[] = [];

      const pageLines = page.lines ?? [];
      const pageParas = page.paragraphs ?? [];
      const pageTables = page.tables ?? [];

      const getSegmentText = (layout: any): string => {
        if (!layout?.textAnchor?.textSegments) return '';
        return (layout.textAnchor.textSegments as Array<{ startIndex?: unknown; endIndex?: unknown }>)
          .map((seg) => {
            const start = Number(seg.startIndex ?? 0);
            const end = Number(seg.endIndex ?? 0);
            return fullText.slice(start, end);
          })
          .join('');
      };

      // Map tables first
      for (const table of pageTables) {
        const allRows = [...(table.headerRows ?? []), ...(table.bodyRows ?? [])];
        for (const row of allRows) {
          for (const cell of row.cells ?? []) {
            const text = getSegmentText(cell.layout).replace(/\n/g, ' ').trim();
            if (text) {
              blocks.push({ type: 'table', text, confidence: mapConfidence(cell.layout?.confidence) });
            }
          }
        }
      }

      // Map paragraphs
      for (const para of pageParas) {
        const text = getSegmentText(para.layout).replace(/\r?\n/g, '\n').trim();
        if (text) {
          blocks.push({ type: 'paragraph', text, confidence: mapConfidence(para.layout?.confidence) });
        }
      }

      // Fallback: map lines when no paragraphs were extracted
      if (blocks.length === 0) {
        for (const line of pageLines) {
          const text = getSegmentText(line.layout).replace(/\r?\n/g, ' ').trim();
          if (text) {
            blocks.push({ type: 'line', text, confidence: mapConfidence(line.layout?.confidence) });
          }
        }
      }

      const pageText = blocks.map((b) => b.text).join('\n');
      return { pageNumber, text: pageText, blocks };
    });

    const documentText = pages.map((p) => p.text).join('\f');

    return { pages, documentText, extractionWarnings };
  }
}
