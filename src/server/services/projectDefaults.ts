import { createHash } from 'crypto';
import { completeBidNumberFromSha1Hex, getBidPackageHashInput } from '../../shared/utils/bidPackageNumber.ts';
import { stripIntakeControlCharacters } from '../../shared/utils/intakeTextGuards.ts';

export { isBlankOrPlaceholderBidNumber } from '../../shared/utils/bidPackageNumber.ts';
export { inferDefaultLocationFromProjectTitle } from '../../shared/utils/inferLocationFromProjectTitle.ts';

const DEBUG_AUTOFILL = process.env.ESTIMATOR_DEBUG_PROJECT_AUTOFILL === '1';

export function logProjectAutofill(event: string, detail: Record<string, unknown> = {}): void {
  if (!DEBUG_AUTOFILL) return;
  console.info(`[projectAutofill] ${event}`, detail);
}

/**
 * User-typed title for conservative default extraction (City, ST, client tokens).
 * Does not apply `isPlausibleProjectTitle` / `coerceSafeProjectName` — those can replace
 * a real title with a fallback and silently disable title-based defaults.
 */
export function titleStringForInference(raw: string | null | undefined): string {
  const t = stripIntakeControlCharacters(String(raw ?? ''));
  return t.replace(/\s+/g, ' ').trim();
}

export function generateBidPackageNumber(params: { projectId: string; projectName: string; now?: Date }): string {
  const now = params.now ?? new Date();
  const year = now.getFullYear();
  const base = getBidPackageHashInput(params.projectId, params.projectName, year);
  const fullHex = createHash('sha1').update(base, 'utf8').digest('hex');
  return completeBidNumberFromSha1Hex(fullHex, year);
}

const CLIENT_RULES: Array<{ label: string; match: (projectName: string) => boolean; client: string }> = [
  {
    label: 'CWA token',
    match: (name) => /\bcwa\b/i.test(name),
    client: 'CWA',
  },
];

export function inferDefaultClientName(params: { projectName: string }): { clientName: string; reason: string } | null {
  const name = String(params.projectName || '').trim();
  if (!name) return null;
  for (const rule of CLIENT_RULES) {
    if (rule.match(name)) return { clientName: rule.client, reason: rule.label };
  }
  return null;
}
