import { stripIntakeControlCharacters } from './intakeTextGuards.ts';

const US_STATE_CODES = new Set<string>([
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY', 'DC',
]);

function normalizeTitleWhitespace(input: string): string {
  return stripIntakeControlCharacters(String(input || ''))
    .replace(/\s+/g, ' ')
    .trim();
}

function isPlausibleCity(city: string): boolean {
  const c = normalizeTitleWhitespace(city);
  if (c.length < 3) return false;
  if (/\d/.test(c)) return false;
  if (/^(project|bid|quote|estimate|addendum|addenda)$/i.test(c)) return false;
  return true;
}

/**
 * When the site address is still blank, derive "City, ST" from common title patterns
 * (e.g. "West Clinic - Kansas City, KS") so intake can pre-fill location like the server-side autofill.
 */
export function inferDefaultLocationFromProjectTitle(params: {
  projectName: string;
}): { locationLabel: string; address: string; reason: string } | null {
  const title = normalizeTitleWhitespace(params.projectName);
  if (!title) return null;

  const dashTail = title.match(/[-–—]\s*([^–—-]{3,}),\s*([A-Z]{2})\s*$/);
  if (dashTail) {
    const city = dashTail[1].trim();
    const state = dashTail[2].trim().toUpperCase();
    if (US_STATE_CODES.has(state) && isPlausibleCity(city)) {
      const loc = `${city}, ${state}`;
      return { locationLabel: loc, address: loc, reason: 'Title suffix “- City, ST”' };
    }
  }

  const paren = title.match(/\(([^,()]{3,}),\s*([A-Z]{2})\)/);
  if (paren) {
    const city = paren[1].trim();
    const state = paren[2].trim().toUpperCase();
    if (US_STATE_CODES.has(state) && isPlausibleCity(city)) {
      const loc = `${city}, ${state}`;
      return { locationLabel: loc, address: loc, reason: 'Title fragment “(City, ST)”' };
    }
  }

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
