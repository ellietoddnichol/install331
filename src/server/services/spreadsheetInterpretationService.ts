const HEADER_ALIASES = [
  'project',
  'project name',
  'job',
  'project number',
  'bid package',
  'client',
  'gc',
  'general contractor',
  'address',
  'location',
  'site',
  'bid date',
  'proposal date',
  'category',
  'scope',
  'item',
  'item code',
  'sku',
  'description',
  'qty',
  'quantity',
  'unit',
  'uom',
  'notes',
  'room',
  'area',
  'zone',
];

function normalizeCell(value: unknown): string {
  return String(value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function scoreHeaderRow(row: string[]): number {
  const normalized = row.map(normalizeCell).filter(Boolean);
  if (normalized.length < 2) return -1;

  let score = 0;
  for (const cell of normalized) {
    if (HEADER_ALIASES.some((alias) => cell === alias || cell.includes(alias))) score += 2;
    if (/qty|quantity|unit|description|item|room|area|category|project|client|address/.test(cell)) score += 1;
    if (/^[a-z][a-z0-9 ]{1,30}$/.test(cell)) score += 0.25;
  }

  const numericLike = normalized.filter((cell) => /^\d+(?:\.\d+)?$/.test(cell)).length;
  score -= numericLike * 1.5;

  if (normalized.length >= 3) score += 1;
  if (normalized[0] && /^(room|area|zone|location)$/.test(normalized[0])) score += 4;
  const codeLikeHeaders = normalized.slice(1).filter((cell) => /^[a-z]{1,6}[ -]?[a-z0-9]{1,8}$/i.test(cell)).length;
  if (codeLikeHeaders >= 2) score += 3;

  return score;
}

export function detectSpreadsheetHeaderRow(rows: string[][]): number {
  const limit = Math.min(rows.length, 15);
  let bestIndex = 0;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (let index = 0; index < limit; index += 1) {
    const score = scoreHeaderRow(rows[index] || []);
    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  }

  return bestIndex;
}

export function extractSpreadsheetPreludeText(rows: string[][], headerRowIndex: number): string {
  return rows
    .slice(0, headerRowIndex)
    .map((row) => row.filter(Boolean).join(' ').trim())
    .filter(Boolean)
    .join('\n');
}
