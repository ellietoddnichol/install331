const OFFICE_ADDRESS = '512 S 70th Street Kansas City, KS 66111';
const OFFICE_COORDS = { lat: 39.0911, lon: -94.7547 };

function normalizeAddressKey(address: string): string {
  return String(address || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function buildAddressCandidates(address: string): string[] {
  const base = String(address || '').trim().replace(/\s+/g, ' ');
  if (!base) return [];
  const candidates = new Set<string>([base]);
  const zipFixed = base.replace(/\b(\d{5})\d+\b/g, '$1');
  if (zipFixed !== base) candidates.add(zipFixed);
  const withStateComma = zipFixed.replace(/\b([A-Z]{2})\s+(\d{5})(?:-\d{4})?\b/, ', $1 $2');
  if (withStateComma !== zipFixed) candidates.add(withStateComma);
  return Array.from(candidates);
}

async function geocodeAddress(address: string, fallback?: { lat: number; lon: number }): Promise<{ lat: number; lon: number } | null> {
  const normalized = normalizeAddressKey(address);
  if (!normalized) return null;
  if (normalized === normalizeAddressKey(OFFICE_ADDRESS)) return OFFICE_COORDS;

  const parseCoords = (lat: unknown, lon: unknown): { lat: number; lon: number } | null => {
    const parsedLat = Number(lat);
    const parsedLon = Number(lon);
    if (!Number.isFinite(parsedLat) || !Number.isFinite(parsedLon)) return null;
    return { lat: parsedLat, lon: parsedLon };
  };

  const geocodeWithNominatim = async (candidate: string): Promise<{ lat: number; lon: number } | null> => {
    const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(candidate)}&limit=1`);
    if (!response.ok) return null;
    const data = await response.json();
    if (!Array.isArray(data) || data.length === 0) return null;
    return parseCoords(data[0]?.lat, data[0]?.lon);
  };

  const geocodeWithCensus = async (candidate: string): Promise<{ lat: number; lon: number } | null> => {
    const response = await fetch(`https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?address=${encodeURIComponent(candidate)}&benchmark=2020&format=json`);
    if (!response.ok) return null;
    const data = await response.json();
    const matches = data?.result?.addressMatches;
    if (!Array.isArray(matches) || matches.length === 0) return null;
    const coordinates = matches[0]?.coordinates;
    return parseCoords(coordinates?.y, coordinates?.x);
  };

  for (const candidate of buildAddressCandidates(address)) {
    const coords = (await geocodeWithNominatim(candidate)) || (await geocodeWithCensus(candidate));
    if (coords) return coords;
  }
  return fallback ?? null;
}

function haversineMiles(coords1: { lat: number; lon: number }, coords2: { lat: number; lon: number }): number {
  const R = 3958.8;
  const dLat = ((coords2.lat - coords1.lat) * Math.PI) / 180;
  const dLon = ((coords2.lon - coords1.lon) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((coords1.lat * Math.PI) / 180) *
      Math.cos((coords2.lat * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export async function calculateDistanceMiles(address: string, originAddress = OFFICE_ADDRESS): Promise<number | null> {
  if (!String(address || '').trim()) return null;
  const originFallback = normalizeAddressKey(originAddress) === normalizeAddressKey(OFFICE_ADDRESS) ? OFFICE_COORDS : undefined;
  const [originCoords, targetCoords] = await Promise.all([
    geocodeAddress(originAddress, originFallback),
    geocodeAddress(address),
  ]);
  if (!originCoords || !targetCoords) return null;
  return haversineMiles(originCoords, targetCoords);
}
