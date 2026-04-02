/**
 * Controlled <input type="number"> helpers. Using Number(raw) || 0 on every
 * change makes an empty field immediately show 0 again; these helpers treat
 * empty input as transient until blur or a valid number is parsed.
 */
export function parseNumericInput(raw: string): number | null {
  const t = raw.trim();
  if (t === '' || t === '-') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** Value for type="number" — empty string while the user clears the field. */
export function numericInputValue(n: number | null | undefined): string | number {
  if (n === null || n === undefined) return '';
  return n;
}
