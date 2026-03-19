
/**
 * Utility for geocoding and distance calculation
 */

export const OFFICE_ADDRESS = "512 S 70th Street Kansas City, KS 66111";
const OFFICE_COORDS = { lat: 39.0911, lon: -94.7547 }; // Kansas City office approx coords
const geocodeCache = new Map<string, { lat: number; lon: number }>();
const DEFAULT_OFFICE_KEY = normalizeAddressKey(OFFICE_ADDRESS);

function normalizeAddressKey(address: string): string {
  return address.trim().toLowerCase().replace(/\s+/g, ' ');
}

async function geocodeAddress(address: string, fallback?: { lat: number; lon: number }): Promise<{ lat: number; lon: number } | null> {
  const normalized = normalizeAddressKey(address);
  if (!normalized) return null;

  const cached = geocodeCache.get(normalized);
  if (cached) return cached;

  if (normalized === normalizeAddressKey(OFFICE_ADDRESS)) {
    geocodeCache.set(normalized, OFFICE_COORDS);
    return OFFICE_COORDS;
  }

  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=1`,
      {
        headers: {
          'User-Agent': 'EstimatorPro-App'
        }
      }
    );

    if (!response.ok) return fallback ?? null;

    const data = await response.json();
    if (data.length === 0) return fallback ?? null;

    const coords = {
      lat: parseFloat(data[0].lat),
      lon: parseFloat(data[0].lon)
    };

    geocodeCache.set(normalized, coords);
    return coords;
  } catch (error) {
    console.error("Geocoding error:", error);
    return fallback ?? null;
  }
}

export async function getDistanceInMiles(address: string, originAddress = OFFICE_ADDRESS): Promise<number | null> {
  if (!address || address.trim() === "") return null;

  const normalizedOrigin = normalizeAddressKey(originAddress);
  const originFallback = normalizedOrigin === DEFAULT_OFFICE_KEY ? OFFICE_COORDS : undefined;

  const [originCoords, targetCoords] = await Promise.all([
    geocodeAddress(originAddress, originFallback),
    geocodeAddress(address),
  ]);

  if (!originCoords || !targetCoords) return null;

  return calculateHaversineDistance(originCoords, targetCoords);
}

function calculateHaversineDistance(coords1: { lat: number, lon: number }, coords2: { lat: number, lon: number }): number {
  const R = 3958.8; // Earth radius in miles
  const dLat = toRad(coords2.lat - coords1.lat);
  const dLon = toRad(coords2.lon - coords1.lon);
  
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(coords1.lat)) * Math.cos(toRad(coords2.lat)) * 
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(degrees: number): number {
  return degrees * (Math.PI / 180);
}
