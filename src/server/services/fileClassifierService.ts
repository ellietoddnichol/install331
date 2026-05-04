import type { IntakeSourceKind, IntakeSourceType } from '../../shared/types/intake.ts';

function normalizeText(value: unknown): string {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function classifyIntakeSourceType(fileName: string, mimeType: string, explicit?: IntakeSourceType): IntakeSourceType {
  if (explicit) return explicit;

  const lowerName = String(fileName || '').toLowerCase();
  const lowerMime = String(mimeType || '').toLowerCase();
  if (lowerName.endsWith('.xlsx') || lowerName.endsWith('.xls') || lowerName.endsWith('.csv') || lowerMime.includes('spreadsheet') || lowerMime.includes('excel') || lowerMime.includes('csv')) {
    return 'spreadsheet';
  }
  if (lowerName.endsWith('.pdf') || lowerMime.includes('pdf')) return 'pdf';
  return 'document';
}

export function deriveDocumentSourceKind(fileName: string, mimeType: string, text: string): IntakeSourceKind {
  const lowerName = String(fileName || '').toLowerCase();
  const lowerMime = String(mimeType || '').toLowerCase();
  const sample = String(text || '').slice(0, 6000).toLowerCase();

  if (lowerName.endsWith('.pdf') || lowerMime.includes('pdf')) return 'pdf-document';
  if (/(proposal|invitation|request for bid|scope of work|estimate)/i.test(sample)) return 'text-document';
  return 'semi-structured-text';
}

export function shouldSkipSpreadsheetSheet(sheetName: string): boolean {
  const normalized = normalizeText(sheetName);
  if (!normalized) return false;
  return /^(readme|instructions|instruction|notes|legend|cover|summary|how to use|help)$/.test(normalized);
}

export function classifyTextBlockShape(text: string): 'metadata' | 'scope' | 'assumptions' | 'mixed' {
  const normalized = normalizeText(text);
  if (!normalized) return 'mixed';
  if (/(project|client|owner|gc|general contractor|address|bid date|proposal date|estimator)/.test(normalized)) return 'metadata';
  if (/(exclusion|clarification|alternate|bond|delivery|freight|tax|shipment|site visit)/.test(normalized)) return 'assumptions';
  if (/(qty|quantity|unit|room|area|scope|item|description|grab bar|mirror|partition|board|cabinet|sign|dispenser)/.test(normalized)) return 'scope';
  return 'mixed';
}