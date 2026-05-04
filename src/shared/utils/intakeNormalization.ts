/**
 * Canonical units for takeoff imports (validator-aligned).
 * OCR and spreadsheets often emit aliases (E.A, SQ FT, EACH).
 */
const UNIT_ALIASES: Record<string, string> = {
  EA: 'EA',
  EACH: 'EA',
  EACHEA: 'EA',
  PCS: 'EA',
  PC: 'EA',
  PIECE: 'EA',
  PIECES: 'EA',
  NR: 'EA',
  NO: 'EA',
  QTY: 'EA',
  LF: 'LF',
  LNFT: 'LF',
  LFT: 'LF',
  FT: 'LF',
  LINEARFT: 'LF',
  LINEARFEET: 'LF',
  SF: 'SF',
  SQFT: 'SF',
  SQ: 'SF',
  SFT: 'SF',
  SQUAREFEET: 'SF',
  SQUAREFOOT: 'SF',
  SY: 'SY',
  SQYD: 'SY',
  CY: 'CY',
  LS: 'LS',
  LUMP: 'LS',
  LUMPSUM: 'LS',
  SET: 'SET',
  ST: 'SET',
  PAIR: 'PAIR',
  PR: 'PR',
  PRS: 'PR',
  HR: 'HR',
  HRS: 'HR',
  HOUR: 'HR',
  HOURS: 'HR',
  DAY: 'DAY',
  DAYS: 'DAY',
  WK: 'WK',
  WEEK: 'WK',
  WEEKS: 'WK',
  MO: 'MO',
  MONTH: 'MO',
  BOX: 'BOX',
  PKG: 'PKG',
  PACKAGE: 'PKG',
  CASE: 'CASE',
  CS: 'CS',
  GAL: 'GAL',
  GALLON: 'GAL',
  GALLONS: 'GAL',
  LB: 'LB',
  LBS: 'LB',
  POUND: 'LB',
  POUNDS: 'LB',
};

function collapseUnitKey(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/\s+/g, '')
    .replace(/[._/\-]/g, '');
}

/** Returns a canonical unit or null if unknown (caller may keep original). */
export function normalizeIntakeUnit(raw: string | null | undefined): string | null {
  const t = String(raw ?? '').trim();
  if (!t) return null;
  const collapsed = collapseUnitKey(t);
  if (!collapsed) return null;
  return UNIT_ALIASES[collapsed] ?? null;
}
