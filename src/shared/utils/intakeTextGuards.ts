/** Strip C0/C1 controls except tab/LF/CR/form-feed (keep PDF page breaks and line structure). */
const INTAKE_CTRL_CHARS = /[\u0000-\u0008\u000B\u000E-\u001F\u007F-\u009F\u200B-\u200F\uFEFF\uFFFD]/g;

/** Remove unsafe control chars only — do not collapse newlines or form-feed (Excel/PDF rely on them). */
export function stripIntakeControlCharacters(text: string): string {
  return String(text || '').replace(INTAKE_CTRL_CHARS, ' ');
}

function intakeTrim(value: unknown): string {
  return String(value ?? '').trim();
}

/** Common when PDF bytes are mis-decoded as Latin-1 (vulgar fractions, superscripts). */
const MOJIBAKE_LATIN_SYMBOLS = /[\u00BC\u00BD\u00BE\u00B9\u00B2\u00B3]/;

function longestAsciiLetterRun(text: string): number {
  const runs = text.match(/[A-Za-z]+/g);
  if (!runs?.length) return 0;
  return Math.max(...runs.map((run) => run.length));
}

/**
 * Reject PDF mojibake / binary soup masquerading as a title (common with Latin-1 buffer dumps).
 * Favors readable Latin job names; allows a Unicode fallback when the title is clearly letter-based.
 */
export function isPlausibleProjectTitle(value: string): boolean {
  const raw = String(value || '');
  if (raw.includes('\uFFFD')) return false;

  const t = intakeTrim(stripIntakeControlCharacters(raw)).replace(/\s+/g, ' ').trim();
  if (t.length < 2 || t.length > 180) return false;

  const nonSpace = t.replace(/\s/g, '');
  if (nonSpace.length < 2) return false;

  let suspicious = 0;
  for (const ch of nonSpace) {
    if (/[A-Za-z0-9]/.test(ch)) continue;
    if ('.,;:\'’"&/@#+\\=()%-–—_'.includes(ch)) continue;
    if (/[\u00C0-\u024F]/.test(ch)) continue;
    suspicious += 1;
  }
  const suspiciousRatio = suspicious / nonSpace.length;
  if (suspiciousRatio > 0.18) return false;

  let asciiSafe = 0;
  for (const ch of nonSpace) {
    if (/[A-Za-z0-9]/.test(ch)) asciiSafe += 1;
  }
  const asciiRatio = asciiSafe / nonSpace.length;
  const asciiLetterRun = longestAsciiLetterRun(t);

  if (asciiRatio < 0.52 && asciiLetterRun < 5) return false;

  if (MOJIBAKE_LATIN_SYMBOLS.test(nonSpace) && (asciiRatio < 0.55 || !/[A-Za-z]{5,}/.test(t))) {
    return false;
  }

  if (MOJIBAKE_LATIN_SYMBOLS.test(nonSpace) && asciiLetterRun < 6) return false;

  if (asciiRatio >= 0.48) {
    const letterWords = t.match(/[A-Za-z]{2,}/g) || [];
    const compactJobCode = /[A-Za-z]\s*[-–#]\s*\d{1,8}\b/.test(t) && t.length <= 36;
    if (letterWords.length < 1 && !compactJobCode) return false;
    return true;
  }

  const letterish = [...nonSpace].filter((ch) => /\p{L}|\p{N}/u.test(ch)).length;
  if (letterish / nonSpace.length < 0.55) return false;
  if (!/\p{L}{3,}/u.test(t)) return false;
  return true;
}

const HEADER_RIBBON_TOKENS = new Set([
  'item',
  'name',
  'qty',
  'quantity',
  'description',
  'unit',
  'uom',
  'room',
  'location',
  'area',
  'manufacturer',
  'mfr',
  'model',
  'finish',
  'notes',
  'price',
  'total',
  'cost',
  'ext',
  'extended',
  'no',
  'number',
  'code',
  'type',
  'cat',
  'category',
]);

/**
 * Section titles, spec callouts, and echoed spreadsheet column headers — not billable scope lines.
 * Dropped at validation so they are not catalog-matched or shown as review items.
 */
/**
 * Proposal footers, lump-sum breakdowns, and contact/quote disclaimers — not billable scope lines.
 * Examples: "Material: $2765", "IF LABOR IS NEEDED, PLEASE CALL FOR QUOTE".
 */
export function looksLikeIntakePricingSummaryOrDisclaimerLine(text: string): boolean {
  const t = intakeTrim(stripIntakeControlCharacters(String(text || ''))).replace(/\s+/g, ' ').trim();
  if (!t) return true;

  // One-line labeled money subtotals (not "2 EA material hoist …")
  if (
    /^(material|labor|sub\s*labor|subcontractor\s*labor|equipment|freight|shipping|delivery|tax|discount|allowance|deposit|retainage)\s*[:\-]\s*\$?\s*[\d,]+(\.\d{2})?\s*$/i.test(
      t
    )
  ) {
    return true;
  }
  if (/^(subtotal|total|grand\s*total|balance\s*due|amount\s*due|price\s*to\s*owner)\s*[:\-]\s*\$?\s*[\d,]+/i.test(t) && t.length < 96) {
    return true;
  }

  // Contact / pricing instructions (any case)
  if (/\b(call|contact)(\s+us)?\s+(for|to)\s+(a\s+)?(quote|pricing|information|details)\b/i.test(t)) return true;
  if (/\bplease\s+call\b/i.test(t) && t.length < 160) return true;
  if (/\b(call|phone)\s+(for|our)\s+(office|shop)\b/i.test(t) && t.length < 120) return true;
  if (/\bif\s+.*\b(needed|required)\b.*\b(please|call|contact)\b/i.test(t)) return true;
  if (/^\s*if\s+labor\b/i.test(t)) return true;
  if (/\blabor\s+(is\s+)?(not\s+)?included\b.*\b(call|contact|quote|separate|additional)\b/i.test(t)) return true;
  if (/\b(priced|quoted)\s+separately\b/i.test(t) && t.length < 140) return true;
  if (/\bsee\s+(our\s+)?(office|shop)\s+for\b/i.test(t) && t.length < 120) return true;

  // ALL CAPS instruction blocks (avoid dropping qty-led product lines)
  if (!/^\d/.test(t) && t.length >= 18 && t.length <= 220) {
    const letters = t.replace(/[^A-Za-z]/g, '');
    if (letters.length >= 18) {
      const upperCount = (t.match(/[A-Z]/g) || []).length;
      const letterCount = (t.match(/[A-Za-z]/g) || []).length;
      if (letterCount > 0 && upperCount / letterCount >= 0.82) {
        if (
          /\b(PLEASE|CALL|QUOTE|CONTACT|PRICING|SUBJECT\s+TO|NOT\s+INCLUDED|ALLOWANCE|WARRANTY|CONDITIONS|SEPARATELY|ESTIMATE\s+ONLY)\b/.test(
            t
          )
        ) {
          return true;
        }
      }
    }
  }

  return false;
}

/**
 * Letterhead, contact blocks, and form labels that models sometimes emit as fake qty=1 lines.
 * Keep conservative: prefer dropping obvious non-products over keeping noise in review.
 */
export function looksLikeIntakeContactOrNonScopeLine(text: string): boolean {
  const t = intakeTrim(stripIntakeControlCharacters(String(text || ''))).replace(/\s+/g, ' ').trim();
  if (!t) return true;

  // Email or URL-only-ish contact
  if (/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/.test(t)) return true;
  if (/^https?:\/\/\S+$/i.test(t)) return true;

  // North American phone / fax style (digits + separators only, optional ext)
  const digitCount = (t.match(/\d/g) || []).length;
  if (digitCount >= 10 && digitCount <= 16 && /^[\d\s().+–—-]+(ext\.?\s*\d+)?$/i.test(t.replace(/\s+/g, ' '))) {
    return true;
  }

  // Job or page number only (no product language)
  if (/^\d{1,4}$/.test(t)) return true;

  // City, ST ZIP (common proposal footer)
  if (/^[A-Za-z][A-Za-z\s.'-]+,\s*[A-Za-z]{2}\s+\d{5}(-\d{4})?\s*$/i.test(t)) return true;

  // Form / schedule labels (not products)
  if (/^bond\s*:\s*Y\s*\/\s*N/i.test(t)) return true;
  if (/^quantity'?s?\s+material\b/i.test(t)) return true;
  if (/^material\s*\/\s*labor\b/i.test(t) && t.length < 48) return true;

  // Proposal / legal fragments (not billable scope)
  if (
    t.length >= 24 &&
    t.length < 220 &&
    /\b(proposal date|approved submittals?|submittals?\s+are|days of|valid\s+(for|through)|herein|whereas|notwithstanding)\b/i.test(t)
  ) {
    return true;
  }

  // Short company letterhead: "Name Name Inc" with no qty-led pattern and no scope tokens
  if (t.length >= 6 && t.length <= 72 && !/^\d/.test(t)) {
    if (/\b(Inc\.?|LLC|L\.L\.C\.|Corp\.?|Corporation|Ltd\.?|L\.P\.|P\.C\.)\s*$/i.test(t)) {
      const lower = t.toLowerCase();
      const hasScopeCue =
        /\b(ea|lf|sf|sq\.?\s*ft|each|lot|set|pair|install|furnish|provide|supply|mount|partition|mirror|bar|dispenser|locker|sign|tile|door|frame|hardware)\b/i.test(
          lower
        );
      if (!hasScopeCue) return true;
    }
  }

  return false;
}

export function looksLikeIntakeSectionHeaderOrTitleLine(text: string): boolean {
  const t = intakeTrim(stripIntakeControlCharacters(String(text || ''))).replace(/\s+/g, ' ').trim();
  if (!t || t.length > 140) return false;
  const lower = t.toLowerCase();

  if (
    /^(item(\s+(name|description|code|number|no\.?))?|qty\.?|quantity|description|location|room|area|unit|uom|manufacturer|mfr\.?|model|finish|notes|total|subtotal|price|cost|ext\.?\s*price|extended\s+price|linetype|layer|header)$/i.test(
      t
    ) &&
    t.length < 52
  ) {
    return true;
  }

  const words = lower.split(/\s+/).filter(Boolean);
  if (words.length >= 2 && words.length <= 14) {
    const stripped = words.map((w) => w.replace(/[^a-z]/g, '')).filter(Boolean);
    if (stripped.length === words.length && stripped.every((w) => HEADER_RIBBON_TOKENS.has(w))) return true;
  }

  const divMatch = /^division\s*\d{1,2}\b\s*(?:[-–—]\s*)?(.*)$/i.exec(t);
  if (divMatch) {
    const rest = (divMatch[1] || '').trim();
    if (!rest) return true;
    if (!/\d/.test(rest) && rest.length < 72) {
      const wordCount = rest.split(/\s+/).filter(Boolean).length;
      // Short trade headings only; long lines are often real scope sentences without part numbers.
      if (wordCount <= 5) return true;
    }
  }

  if (/^(section|specification|spec)\s+[0-9]{1,3}([.\-][0-9A-Za-z]+)*$/i.test(t)) return true;
  if (/^part\s+[IVX\d]+$/i.test(t)) return true;

  if (/^(schedule|summary|index|table of contents|appendix)\s+(of|for)\b/i.test(t)) return true;
  if (/^(general\s+)?notes?\s*:/i.test(t)) return true;
  if (/^scope(\s+of\s+work)?\s*:/i.test(lower)) return true;
  if (/:$/.test(t) && t.length <= 56 && !/\d/.test(t)) return true;

  if (t.length >= 6 && t.length <= 82 && t === t.toUpperCase() && /[A-Z]{4,}/.test(t) && !/\d/.test(t)) {
    if (/\b(SCHEDULE|SUMMARY|SCOPE|DRAWING|DETAIL|ACCESSOR|PARTITION|FIXTURE|SPECIAL|TITLE|SHEET|NOTE|INDEX)\b/.test(t)) return true;
  }

  if (!/\d/.test(t) && t.length >= 12 && t.length <= 78) {
    if (/\b(accessories|specialties|equipment|systems|fixtures|partitions)\b/i.test(t)) {
      if (/\b(toilet|restroom|bathroom|locker|signage|visual|wall|fire|storage|shower|plumbing|washroom)\b/i.test(lower)) return true;
    }
  }

  if (/^(drawing|sheet|detail)\s*[#:]?\s*[A-Z0-9.-]{0,14}\s*$/i.test(t) && t.length < 44) return true;

  return false;
}

const PROPOSAL_OK_SYMBOLS = '.,;:\'’"&/@#+\\=()%-–—_*×°•·°¹²³¼½¾';

/**
 * One takeoff line worth mentioning in auto-generated "Scope appears to include …" copy.
 */
export function isPlausibleProposalScopeSnippet(text: string): boolean {
  const raw = String(text || '');
  if (!raw.trim() || raw.includes('\uFFFD')) return false;
  if (looksLikeIntakePricingSummaryOrDisclaimerLine(raw)) return false;
  if (looksLikeIntakeSectionHeaderOrTitleLine(raw)) return false;

  const t = intakeTrim(stripIntakeControlCharacters(raw)).replace(/\s+/g, ' ').trim();
  if (!t || t.length > 900) return false;

  const nonSpace = t.replace(/\s/g, '');
  if (nonSpace.length < 4) return false;

  let suspicious = 0;
  for (const ch of nonSpace) {
    if (/[A-Za-z0-9]/.test(ch)) continue;
    if (PROPOSAL_OK_SYMBOLS.includes(ch)) continue;
    if (/[\u00C0-\u024F]/.test(ch)) continue;
    suspicious += 1;
  }
  if (suspicious / nonSpace.length > 0.22) return false;

  const asciiLetters = [...nonSpace].filter((ch) => /[A-Za-z]/.test(ch)).length;
  if (nonSpace.length > 20 && asciiLetters / nonSpace.length < 0.38) return false;
  if (t.length > 28 && longestAsciiLetterRun(t) < 4) return false;

  return true;
}

/**
 * Proposal intro / terms / multi-line blocks: reject PDF binary dumps and decoder garbage.
 */
export function isPlausibleCustomerFacingProposalText(text: string): boolean {
  const raw = String(text || '');
  if (!raw.trim() || raw.includes('\uFFFD')) return false;

  const t = intakeTrim(stripIntakeControlCharacters(raw)).replace(/\s+/g, ' ').trim();
  if (!t) return false;

  const nonSpace = t.replace(/\s/g, '');
  if (nonSpace.length < 10) return false;

  let suspicious = 0;
  for (const ch of nonSpace) {
    if (/[A-Za-z0-9]/.test(ch)) continue;
    if (PROPOSAL_OK_SYMBOLS.includes(ch)) continue;
    if (/[\u00C0-\u024F]/.test(ch)) continue;
    suspicious += 1;
  }
  if (suspicious / nonSpace.length > 0.24) return false;

  const asciiLetters = [...nonSpace].filter((ch) => /[A-Za-z]/.test(ch)).length;
  if (nonSpace.length > 40 && asciiLetters / nonSpace.length < 0.28) return false;
  if (t.length > 56 && longestAsciiLetterRun(t) < 6) return false;

  const winSize = 72;
  const step = 24;
  for (let start = 0; start < t.length; start += step) {
    const slice = t.slice(start, start + winSize);
    const nsWin = slice.replace(/\s/g, '');
    if (nsWin.length < 36) continue;
    let susWin = 0;
    for (const ch of nsWin) {
      if (/[A-Za-z0-9]/.test(ch)) continue;
      if (PROPOSAL_OK_SYMBOLS.includes(ch)) continue;
      if (/[\u00C0-\u024F]/.test(ch)) continue;
      susWin += 1;
    }
    if (susWin / nsWin.length > 0.34) return false;
    const lettersWin = [...nsWin].filter((ch) => /[A-Za-z]/.test(ch)).length;
    if (lettersWin / nsWin.length < 0.22) return false;
  }

  return true;
}

/** Last-line defense: never surface mojibake / buffer dumps as a project name in API responses. */
export function coerceSafeProjectName(value: string, fallback = 'Imported Project'): string {
  const t = intakeTrim(stripIntakeControlCharacters(String(value || ''))).replace(/\s+/g, ' ').trim();
  if (!t) return fallback;
  return isPlausibleProjectTitle(t) ? t : fallback;
}

/** Use PDF/upload file stem as a title only when it looks like a real job name (not binary garbage). */
export function plausibleTitleFromFileName(fileName: string): string | null {
  const stem = String(fileName || '')
    .replace(/\.[^/.]+$/i, '')
    .replace(/[_]+/g, ' ')
    .trim();
  if (!stem) return null;
  return isPlausibleProjectTitle(stem) ? stem : null;
}
