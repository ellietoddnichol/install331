import { createHash } from 'crypto';
import { completeBidNumberFromSha1Hex, getBidPackageHashInput } from '../../shared/utils/bidPackageNumber.ts';
import { stripIntakeControlCharacters } from '../../shared/utils/intakeTextGuards.ts';

export { isBlankOrPlaceholderBidNumber } from '../../shared/utils/bidPackageNumber.ts';

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

const US_STATE_CODES = new Set<string>([
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC',
]);

function normalizeTitleWhitespace(input: string): string {
  return String(input || '').replace(/\s+/g, ' ').trim();
}

function isPlausibleCity(city: string): boolean {
  const c = normalizeTitleWhitespace(city);
  if (c.length < 3) return false;
  if (/\d/.test(c)) return false;
  // Avoid generic tokens like "Project" being misread as a city.
  if (/^(project|bid|quote|estimate|addendum|addenda)$/i.test(c)) return false;
  return true;
}

export function inferDefaultLocationFromProjectTitle(params: {
  projectName: string;
}): { locationLabel: string; address: string; reason: string } | null {
  const title = normalizeTitleWhitespace(params.projectName);
  if (!title) return null;

  // Strong pattern: "... - City, ST" at end (capture only the city token immediately before the comma/state).
  const dashTail = title.match(/[-–—]\s*([^–—-]{3,}),\s*([A-Z]{2})\s*$/);
  if (dashTail) {
    const city = dashTail[1].trim();
    const state = dashTail[2].trim().toUpperCase();
    if (US_STATE_CODES.has(state) && isPlausibleCity(city)) {
      const loc = `${city}, ${state}`;
      return { locationLabel: loc, address: loc, reason: 'Title suffix “- City, ST”' };
    }
  }

  // Strong pattern: "(City, ST)" anywhere.
  const paren = title.match(/\(([^,()]{3,}),\s*([A-Z]{2})\)/);
  if (paren) {
    const city = paren[1].trim();
    const state = paren[2].trim().toUpperCase();
    if (US_STATE_CODES.has(state) && isPlausibleCity(city)) {
      const loc = `${city}, ${state}`;
      return { locationLabel: loc, address: loc, reason: 'Title fragment “(City, ST)”' };
    }
  }

  // Conservative fallback: "City, ST" somewhere in the title (first match).
  const inline = title.match(/\b([^,()]{3,}),\s*([A-Z]{2})\b/);
  if (inline) {
    const city = inline[1].trim();
    const state = inline[2].trim().toUpperCase();
    if (US_STATE_CODES.has(state) && isPlausibleCity(city)) {
      const loc = `${city}, ${state}`;
      return { locationLabel: loc, address: loc, reason: 'Title fragment “City, ST”' };
    }
  }

  return null;
}

