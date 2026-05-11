/**
 * Defaults for OpenStreetMap Nominatim search so short queries (e.g. "Springfield", "Columbus")
 * do not float to other countries. Biases toward the United States and a broad US Midwest box.
 *
 * https://nominatim.org/release-docs/latest/api/Search/
 *
 * Override via env (server: `process.env`; optional Vite `import.meta.env.VITE_*` not wired here—pass `env`):
 * - `ADDRESS_SUGGEST_COUNTRY_CODES` — default `us`; set `world` or `*` to omit `countrycodes`.
 * - `ADDRESS_SUGGEST_VIEWBOX` — `left,top,right,bottom` (west lon, north lat, east lon, south lat); default Midwest; `off` / `none` / `0` to omit.
 * - `ADDRESS_SUGGEST_BOUNDED` — `1` / `true` to add `bounded=1` (strictly inside viewbox; use sparingly).
 */

/** ISO 3166-1 alpha-2, comma-separated for Nominatim `countrycodes`. */
export const NOMINATIM_DEFAULT_COUNTRY_CODES = 'us';

/**
 * Approx. US Midwest viewbox (Nominatim: west lon, north lat, east lon, south lat).
 * Covers roughly ND–MN–IA–MO east through OH; soft bias unless `bounded=1`.
 */
export const NOMINATIM_DEFAULT_US_MIDWEST_VIEWBOX = '-104.5,49.4,-80.0,36.0';

export type NominatimRegionEnv = Record<string, string | undefined>;

function truthyBounded(raw: string | undefined): boolean {
  const v = String(raw ?? '')
    .trim()
    .toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

function resolveCountryCodes(env: NominatimRegionEnv): string | null {
  if (!Object.prototype.hasOwnProperty.call(env, 'ADDRESS_SUGGEST_COUNTRY_CODES')) {
    return NOMINATIM_DEFAULT_COUNTRY_CODES;
  }
  const t = String(env.ADDRESS_SUGGEST_COUNTRY_CODES ?? '').trim();
  if (!t || t === '*' || t.toLowerCase() === 'world' || t.toLowerCase() === 'all') return null;
  return t;
}

function resolveViewbox(env: NominatimRegionEnv): string | null {
  if (!Object.prototype.hasOwnProperty.call(env, 'ADDRESS_SUGGEST_VIEWBOX')) {
    return NOMINATIM_DEFAULT_US_MIDWEST_VIEWBOX;
  }
  const t = String(env.ADDRESS_SUGGEST_VIEWBOX ?? '').trim();
  if (!t || t === '0' || /^off|none$/i.test(t)) return null;
  return t;
}

/** Mutates `url` (Nominatim `/search` or compatible) with region bias query params. */
export function applyNominatimRegionSearchParams(url: URL, env: NominatimRegionEnv): void {
  const country = resolveCountryCodes(env);
  if (country) url.searchParams.set('countrycodes', country);

  const viewbox = resolveViewbox(env);
  if (viewbox) {
    url.searchParams.set('viewbox', viewbox);
    if (truthyBounded(env.ADDRESS_SUGGEST_BOUNDED)) {
      url.searchParams.set('bounded', '1');
    }
  }
}
