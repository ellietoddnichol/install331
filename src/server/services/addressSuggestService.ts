/**
 * OpenStreetMap Nominatim search (server-side only; requires valid User-Agent per usage policy).
 * https://operations.osmfoundation.org/policies/nominatim/
 */

export type AddressSuggestion = {
  label: string;
};

const DEFAULT_UA = 'CWA-Estimator/1.0 (+https://github.com/ellietoddnichol/install331)';

export async function suggestAddresses(query: string): Promise<AddressSuggestion[]> {
  const q = String(query || '').trim();
  if (q.length < 3) return [];

  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.searchParams.set('format', 'json');
  url.searchParams.set('q', q);
  url.searchParams.set('addressdetails', '1');
  url.searchParams.set('limit', '10');

  const country = String(process.env.ADDRESS_SUGGEST_COUNTRY_CODES || '').trim();
  if (country) url.searchParams.set('countrycodes', country);

  const res = await fetch(url.toString(), {
    headers: {
      'User-Agent': process.env.NOMINATIM_USER_AGENT || DEFAULT_UA,
      Accept: 'application/json',
    },
  });

  if (!res.ok) return [];

  const data = (await res.json()) as Array<{ display_name?: string }>;
  if (!Array.isArray(data)) return [];

  const seen = new Set<string>();
  const out: AddressSuggestion[] = [];
  for (const row of data) {
    const label = String(row.display_name || '')
      .trim()
      .replace(/^,\s*/, '');
    if (!label || seen.has(label)) continue;
    seen.add(label);
    out.push({ label });
  }
  return out;
}
