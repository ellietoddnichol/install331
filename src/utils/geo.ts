
/**
 * Utility for geocoding and distance calculation
 */

export const OFFICE_ADDRESS = "512 S 70th Street Kansas City, KS 66111";
const OFFICE_COORDS = { lat: 39.0911, lon: -94.7547 }; // Kansas City office approx coords

export async function getDistanceInMiles(address: string): Promise<number | null> {
  if (!address || address.trim() === "") return null;

  try {
    // Use Nominatim for geocoding (OpenStreetMap)
    // Note: In a production app, use Google Maps Geocoding API
    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=1`,
      {
        headers: {
          'User-Agent': 'EstimatorPro-App'
        }
      }
    );

    if (!response.ok) return null;

    const data = await response.json();
    if (data.length === 0) return null;

    const targetCoords = {
      lat: parseFloat(data[0].lat),
      lon: parseFloat(data[0].lon)
    };

    return calculateHaversineDistance(OFFICE_COORDS, targetCoords);
  } catch (error) {
    console.error("Geocoding error:", error);
    return null;
  }
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
