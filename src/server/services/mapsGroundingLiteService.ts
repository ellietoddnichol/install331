import { GoogleGenAI, type Tool } from '@google/genai';
import { INTAKE_GEMINI_MODEL } from './structuredExtractionSchemas.ts';

/** Streamable HTTP MCP endpoint for Maps Grounding Lite (mapstools API). */
export const MAPS_GROUNDING_LITE_MCP_URL = 'https://mapstools.googleapis.com/mcp';

export function isMapsGroundingEnabled(): boolean {
  const v = process.env.GOOGLE_MAPS_GROUNDING_ENABLED?.trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

/** Maps Platform key with Maps Grounding Lite (mapstools.googleapis.com) enabled — not the Gemini API key. */
export function getMapsGroundingApiKey(): string | undefined {
  const k =
    process.env.GOOGLE_MAPS_GROUNDING_API_KEY?.trim() ||
    process.env.GOOGLE_MAPS_API_KEY?.trim();
  return k || undefined;
}

export function buildMapsGroundingTool(apiKey: string): Tool {
  return {
    mcpServers: [
      {
        name: 'maps-grounding-lite',
        streamableHttpTransport: {
          url: MAPS_GROUNDING_LITE_MCP_URL,
          headers: { 'X-Goog-Api-Key': apiKey },
        },
      },
    ],
  };
}

/** Skip Grounding when the address already looks like a full US line (saves quota). */
export function shouldAttemptMapsGroundingForAddress(address: string): boolean {
  const a = address.trim();
  if (!a) return true;
  if (a.length >= 14 && /\b\d{5}(-\d{4})?\b/.test(a)) return false;
  return true;
}

export interface MapsGroundingAddressResult {
  /** Best single-line site address, or empty if unavailable. */
  addressLine: string;
  /** Google Maps place URL for attribution (Grounding Lite terms require showing sources). */
  placeUrl?: string;
}

/** Parse model output: first line is the address; MAPS_LINK: or bare https://maps URLs for attribution. */
export function parseGroundingAddressFromModelText(text: string): MapsGroundingAddressResult {
  const raw = String(text || '').trim();
  if (!raw) return { addressLine: '' };

  let placeUrl: string | undefined;
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    const labeled = t.match(/^MAPS_LINK:\s*(https?:\/\/\S+)/i);
    if (labeled) {
      placeUrl = labeled[1];
      break;
    }
    const linkMatch = t.match(/https?:\/\/[^\s]+/);
    if (linkMatch && /google\.com\/maps|maps\.google/.test(linkMatch[0])) {
      placeUrl = linkMatch[0];
      break;
    }
  }

  const firstLine = raw.split(/\r?\n/)[0]?.trim() || '';
  if (!firstLine || /^ADDRESS_UNAVAILABLE$/i.test(firstLine)) {
    return { addressLine: '', placeUrl };
  }

  return { addressLine: firstLine.replace(/^address:\s*/i, '').trim(), placeUrl };
}

/**
 * Uses Gemini with Maps Grounding Lite MCP tools to search/verify a job site address.
 * Requires GEMINI_API_KEY plus a Maps key (see getMapsGroundingApiKey).
 */
export async function enrichSiteAddressWithMapsGrounding(params: {
  geminiApiKey: string;
  contextText: string;
  hintAddress?: string;
}): Promise<MapsGroundingAddressResult | null> {
  if (!isMapsGroundingEnabled()) return null;
  const mapsKey = getMapsGroundingApiKey();
  if (!mapsKey) {
    console.warn('[maps-grounding] GOOGLE_MAPS_GROUNDING_API_KEY or GOOGLE_MAPS_API_KEY not set; skipping.');
    return null;
  }

  const excerpt = params.contextText.trim().slice(0, 6000);
  if (excerpt.length < 30) return null;

  const model = process.env.GOOGLE_MAPS_GROUNDING_MODEL?.trim() || INTAKE_GEMINI_MODEL;

  const prompt = [
    'You assist a construction estimator. Use the Google Maps Grounding tools (search_places, compute_routes, lookup_weather) when helpful.',
    'Goal: determine the single best formatted street mailing address for the job site described below.',
    'If you cannot determine a real address, reply with exactly one line: ADDRESS_UNAVAILABLE',
    'Otherwise reply with exactly one line: the full street address (city, region/state, postal code if known).',
    'If the tools return a Google Maps link for the place, add a second line: MAPS_LINK: <url>',
    '',
    params.hintAddress?.trim() ? `Known address hint: ${params.hintAddress.trim()}` : '',
    '',
    'Source excerpt:',
    excerpt,
  ]
    .filter(Boolean)
    .join('\n');

  try {
    const ai = new GoogleGenAI({ apiKey: params.geminiApiKey });
    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        tools: [buildMapsGroundingTool(mapsKey)],
        automaticFunctionCalling: { maximumRemoteCalls: 6, disable: false },
      },
    });

    const text = response.text?.trim() || '';
    return parseGroundingAddressFromModelText(text);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[maps-grounding] enrichSiteAddressWithMapsGrounding failed: ${message}`);
    return null;
  }
}
