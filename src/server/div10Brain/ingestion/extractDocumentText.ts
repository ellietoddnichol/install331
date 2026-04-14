import pdfParse from 'pdf-parse';
import * as XLSX from 'xlsx';

export type ExtractedDocument = {
  rawText: string;
  pages?: { page: number; text: string }[];
};

export async function extractDocumentText(buffer: Buffer, mimeType: string): Promise<ExtractedDocument> {
  const mt = mimeType.toLowerCase();
  if (mt.includes('pdf')) {
    const data = await pdfParse(buffer);
    return { rawText: data.text || '', pages: undefined };
  }
  if (mt.includes('spreadsheet') || mt.includes('excel') || mt.includes('sheet') || mt.endsWith('.xlsx') || mt.endsWith('.xls')) {
    const wb = XLSX.read(buffer, { type: 'buffer' });
    const parts: string[] = [];
    for (const name of wb.SheetNames) {
      const sheet = wb.Sheets[name];
      const csv = XLSX.utils.sheet_to_csv(sheet);
      parts.push(`## Sheet: ${name}\n${csv}`);
    }
    return { rawText: parts.join('\n\n') };
  }
  if (mt.includes('csv') || mt.endsWith('csv')) {
    return { rawText: buffer.toString('utf8') };
  }
  if (mt.includes('text') || mt.endsWith('txt')) {
    return { rawText: buffer.toString('utf8') };
  }
  throw new Error(`Unsupported mime type for extraction: ${mimeType}`);
}
