import { google } from 'googleapis';
import type { IntakeProjectMetadata } from '../../shared/types/intake.ts';
import { buildGoogleServiceAccountJwt } from './googleSheetsCatalogSync.ts';

/** Cloud Natural Language + other GCP APIs on the same project. */
const NLP_JWT_SCOPES = ['https://www.googleapis.com/auth/cloud-platform'];

const MAX_ANALYZE_CHARS = 8000;

export interface NlpMetadataHints {
  client?: string;
  generalContractor?: string;
  address?: string;
}

function isNlpEnabled(): boolean {
  const v = process.env.GOOGLE_NATURAL_LANGUAGE_ENABLED?.trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

function normalizeEntityType(type: string | null | undefined): string {
  return String(type || '')
    .replace(/^TYPE_/i, '')
    .toUpperCase();
}

/**
 * Calls Cloud Natural Language `analyzeEntities` on a slice of text and maps
 * ORGANIZATION / ADDRESS / LOCATION hints for intake metadata.
 * Best-effort: failures log a warning and return {}.
 */
export async function extractIntakeMetadataHintsFromText(text: string): Promise<NlpMetadataHints> {
  if (!isNlpEnabled()) return {};
  const trimmed = text.trim();
  if (trimmed.length < 40) return {};

  try {
    const jwt = buildGoogleServiceAccountJwt(NLP_JWT_SCOPES);
    const language = google.language({ version: 'v1', auth: jwt });
    const res = await language.documents.analyzeEntities({
      requestBody: {
        document: {
          content: trimmed.slice(0, MAX_ANALYZE_CHARS),
          type: 'PLAIN_TEXT',
          language: 'en',
        },
        encodingType: 'UTF8',
      },
    });

    const entities = res.data.entities || [];
    const orgs = entities
      .filter((e) => normalizeEntityType(e.type) === 'ORGANIZATION')
      .filter((e) => (e.name || '').trim().length > 1)
      .sort((a, b) => (Number(b.salience) || 0) - (Number(a.salience) || 0));

    const addresses = entities
      .filter((e) => normalizeEntityType(e.type) === 'ADDRESS')
      .map((e) => (e.name || '').trim())
      .filter(Boolean);

    const locationLines = entities
      .filter((e) => normalizeEntityType(e.type) === 'LOCATION')
      .map((e) => (e.name || '').trim())
      .filter((name) => name.length > 2 && /\d/.test(name));

    const hints: NlpMetadataHints = {};
    if (orgs[0]?.name) hints.client = String(orgs[0].name).trim();
    if (orgs[1]?.name) hints.generalContractor = String(orgs[1].name).trim();
    if (addresses[0]) hints.address = addresses[0];
    else if (locationLines[0]) hints.address = locationLines[0];

    return hints;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[natural-language] analyzeEntities skipped: ${message}`);
    return {};
  }
}

/** Fills only empty fields on `base` (heuristics + Gemini stay primary). */
export function mergeNlpHintsIntoPartialMetadata(
  base: Partial<IntakeProjectMetadata>,
  hints: NlpMetadataHints
): Partial<IntakeProjectMetadata> {
  const out = { ...base };
  if (!hints.client?.trim() && !hints.generalContractor?.trim() && !hints.address?.trim()) {
    return out;
  }
  if (!out.client?.trim() && hints.client) out.client = hints.client;
  if (!out.generalContractor?.trim() && hints.generalContractor) out.generalContractor = hints.generalContractor;
  if (!out.address?.trim() && hints.address) out.address = hints.address;
  return out;
}
