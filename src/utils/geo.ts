import { apiFetch } from '../services/api';

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

function buildAddressCandidates(address: string): string[] {
  const base = address.trim().replace(/\s+/g, ' ');
  if (!base) return [];
  const candidates = new Set<string>([base]);

  // Fix common typo where ZIP gets one extra digit (e.g. 660478 -> 66047)
  const zipFixed = base.replace(/\b(\d{5})\d+\b/g, '$1');
  if (zipFixed !== base) candidates.add(zipFixed);

  // Ensure comma before state+ZIP for geocoders that parse better with separators.
  const withStateComma = zipFixed.replace(/\b([A-Z]{2})\s+(\d{5})(?:-\d{4})?\b/, ', $1 $2');
  if (withStateComma !== zipFixed) candidates.add(withStateComma);

  return Array.from(candidates);
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

  try {
    const candidates = buildAddressCandidates(address);
    let coords: { lat: number; lon: number } | null = null;
    for (const candidate of candidates) {
      coords = (await geocodeWithNominatim(candidate)) || (await geocodeWithCensus(candidate));
      if (coords) break;
    }
    coords = coords || fallback || null;
    if (coords) geocodeCache.set(normalized, coords);
    return coords;
  } catch (error) {
    console.error('Geocoding error:', error);
    return fallback ?? null;
  }
}

export async function getDistanceInMiles(address: string, originAddress = OFFICE_ADDRESS): Promise<number | null> {
  if (!address || address.trim() === "") return null;

  // Prefer same-origin server lookup first to avoid browser geocoding/CORS issues.
  try {
    const query = new URLSearchParams({ address, originAddress });
    const response = await apiFetch(`/api/v1/projects/distance?${query.toString()}`);
    if (response.ok) {
      const payload = await response.json();
      const miles = Number(payload?.data?.miles);
      if (Number.isFinite(miles) && miles >= 0) return miles;
    }
  } catch (_error) {
    // Fall back to in-browser geocoding below.
  }

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
