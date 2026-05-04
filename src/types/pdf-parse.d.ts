declare module 'pdf-parse/lib/pdf-parse.js' {
  interface PdfParseResult {
    numpages: number;
    numrender: number;
    info: Record<string, unknown>;
    metadata: unknown | null;
    text: string;
    version: string;
  }
  function pdfParse(dataBuffer: Buffer, options?: { max?: number }): Promise<PdfParseResult>;
  export = pdfParse;
}
