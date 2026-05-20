import JSZip from 'jszip';
import { stripIntakeControlCharacters } from '../../../shared/utils/intakeTextGuards.ts';

function textFromWordDocumentXml(xml: string): string {
  const withBreaks = xml
    .replace(/<w:tab[^/]*\/>/gi, '\t')
    .replace(/<w:br[^/]*\/>/gi, '\n')
    .replace(/<\/w:p>/gi, '\n');
  const parts: string[] = [];
  const re = /<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(withBreaks))) {
    const chunk = String(match[1] || '').trim();
    if (chunk) parts.push(chunk);
  }
  return stripIntakeControlCharacters(parts.join(' ')).replace(/\s+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

/** Extract plain text from a .docx buffer (Office Open XML zip). */
export async function extractDocxTextFromBuffer(buffer: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(buffer);
  const xml = await zip.file('word/document.xml')?.async('string');
  if (!xml) return '';
  return textFromWordDocumentXml(xml);
}

export function isDocxFile(fileName: string, mimeType: string): boolean {
  const lowerName = String(fileName || '').toLowerCase();
  const lowerMime = String(mimeType || '').toLowerCase();
  return lowerName.endsWith('.docx') || lowerMime.includes('wordprocessingml.document');
}
