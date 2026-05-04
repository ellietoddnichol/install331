import { coerceSafeProjectName } from './intakeTextGuards';

function normalizeNameForBidPackage(input: string): string {
  return String(input || '')
    .trim()
    .toLowerCase();
}

/**
 * String fed to SHA-1. Must match `src/server/services/projectDefaults` / `createProject` behavior.
 * `projectName` is the **post-coerce** name (see `coerceSafeProjectName` in `createProject` / preview).
 */
export function getBidPackageHashInput(projectId: string, projectName: string, year: number): string {
  return `${projectId}|${normalizeNameForBidPackage(projectName)}|${year}`;
}

/**
 * `sha1Hex` is the 40-char hex string from Node `createHash('sha1')` or Web Crypto.
 */
export function completeBidNumberFromSha1Hex(sha1Hex: string, year: number): string {
  const digest = sha1Hex.slice(0, 6).toUpperCase();
  return `BP-${year}-${digest}`;
}

/**
 * True when the bid/job # field is empty or a common "no number yet" placeholder.
 */
export function isBlankOrPlaceholderBidNumber(raw: string | null | undefined): boolean {
  const s = String(raw ?? '').trim();
  if (!s) return true;
  const lower = s.toLowerCase();
  if (s === '0' || s === '-' || s === '–' || s === '—' || s === '--') return true;
  if (['n/a', 'na', 'tbd', 'none', 'pending', 'unknown'].includes(lower)) return true;
  return false;
}

/**
 * Same BP- value the server will assign when `projectNumber` is left blank, using this `projectId` and
 * coercing `projectName` the same way as `createProject`.
 */
export async function generateBidPackageNumberPreview(params: { projectId: string; projectName: string; now?: Date }): Promise<string> {
  const now = params.now ?? new Date();
  const year = now.getFullYear();
  const name = coerceSafeProjectName(String(params.projectName ?? ''), 'Untitled Project');
  const base = getBidPackageHashInput(params.projectId, name, year);
  if (typeof globalThis.crypto?.subtle?.digest === 'function') {
    const buf = await globalThis.crypto.subtle.digest('SHA-1', new TextEncoder().encode(base));
    const fullHex = Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    return completeBidNumberFromSha1Hex(fullHex, year);
  }
  throw new Error('Web Crypto (SHA-1) is not available; cannot preview bid package number in this environment.');
}
