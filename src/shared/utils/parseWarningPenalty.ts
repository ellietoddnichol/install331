/** Normalize warning text so repeated variants collapse to one signature (shared client + server). */
export function normalizeWarningSignature(warning: string): string {
  return String(warning || '')
    .toLowerCase()
    .replace(/item\s+[a-z0-9 _./:-]+/g, 'item <source>')
    .replace(/from header\s+"[^"]+"/g, 'from header <header>')
    .replace(/\([^\)]*\)/g, '(<detail>)')
    .replace(/\b\d+(?:\.\d+)?\b/g, '<n>')
    .replace(/\s+/g, ' ')
    .trim();
}

export function buildWarningPenaltyFromWarningStrings(warnings: string[], itemCount: number): number {
  if (!warnings.length) return 0;

  const uniqueWarningSignatures = new Set(warnings.map(normalizeWarningSignature)).size;
  const repeatedWarningCount = Math.max(0, warnings.length - uniqueWarningSignatures);
  const uniquePenalty = uniqueWarningSignatures * 0.025;
  const repeatedPenalty = Math.min(0.08, repeatedWarningCount * 0.0015);
  const coveragePenalty =
    itemCount > 0 ? Math.min(0.06, (uniqueWarningSignatures / Math.max(itemCount, 1)) * 0.35) : 0.06;

  return Math.min(0.22, uniquePenalty + repeatedPenalty + coveragePenalty);
}
