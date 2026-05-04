import { intakeAsText, normalizeComparableText } from '../metadataExtractorService.ts';
import { TAKEOFF_FAMILY_HINT_MAP, TAKEOFF_TOKEN_ALIAS_MAP } from './takeoffCatalogRegistry.ts';

const PHRASE_NORMALIZERS: Array<[RegExp, string]> = [
  [/\bw\//gi, 'with '],
  [/\b2\s*wall\b/gi, 'two wall'],
  [/\b3\s*wall\b/gi, 'three wall'],
  [/\brecess\s*kit\b/gi, 'recess kit'],
];

export interface HeaderInterpretation {
  rawHeader: string;
  normalizedSearchText: string;
  parsedTokens: string[];
  expandedTokens: string[];
  dimensions: { inches?: number[] };
  modelTokens: string[];
  categoryHint: string | null;
  parsedFamily: string | null;
  accessoryTokens: string[];
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function inferCategory(tokens: string[]): string | null {
  const joined = tokens.join(' ');
  if (joined.includes('grab bar')) return 'Toilet Accessories';
  if (joined.includes('coat hook')) return 'Toilet Accessories';
  if (joined.includes('sanitary napkin')) return 'Toilet Accessories';
  if (joined.includes('toilet tissue dispenser')) return 'Toilet Accessories';
  if (joined.includes('soap dispenser')) return 'Toilet Accessories';
  if (joined.includes('paper towel dispenser')) return 'Toilet Accessories';
  if (joined.includes('hand dryer')) return 'Toilet Accessories';
  if (joined.includes('shower curtain')) return 'Toilet Accessories';
  if (joined.includes('folding shower seat')) return 'Toilet Accessories';
  return null;
}

function normalizeModelToken(token: string): string {
  return intakeAsText(token).toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function inferFamily(parsedTokens: string[], expandedTokens: string[], modelTokens: string[]): string | null {
  for (const token of parsedTokens) {
    if (TAKEOFF_FAMILY_HINT_MAP[token]) return TAKEOFF_FAMILY_HINT_MAP[token];
  }

  for (const token of modelTokens) {
    const normalized = normalizeModelToken(token);
    for (const key of Object.keys(TAKEOFF_FAMILY_HINT_MAP)) {
      if (normalized.startsWith(normalizeModelToken(key))) return TAKEOFF_FAMILY_HINT_MAP[key];
    }
  }

  const joined = expandedTokens.join(' ');
  if (joined.includes('grab bar')) return 'grab bar';
  if (joined.includes('coat hook')) return 'coat hook';
  if (joined.includes('sanitary napkin vendor')) return 'sanitary napkin vendor';
  if (joined.includes('sanitary napkin disposal')) return 'sanitary napkin disposal';
  if (joined.includes('toilet tissue dispenser')) return 'toilet tissue dispenser';
  if (joined.includes('soap dispenser')) return 'soap dispenser';
  if (joined.includes('hand dryer')) return 'hand dryer';
  if (joined.includes('shower curtain')) return 'shower curtain';
  if (joined.includes('shower curtain rod')) return 'shower curtain rod';
  if (joined.includes('shower curtain hooks')) return 'shower curtain hooks';
  if (joined.includes('folding shower seat')) return 'folding shower seat';
  if (joined.includes('mirror')) return 'mirror';
  return null;
}

function extractAccessoryTokens(parsedTokens: string[], expandedTokens: string[]): string[] {
  const accessories = new Set<string>();
  if (parsedTokens.includes('with') && (parsedTokens.includes('recess') || parsedTokens.includes('kit'))) {
    accessories.add('recess kit');
  }
  if (expandedTokens.includes('recess') && expandedTokens.includes('kit')) {
    accessories.add('recess kit');
  }
  return Array.from(accessories);
}

export function normalizeTakeoffHeader(rawHeader: string): string {
  let normalized = intakeAsText(rawHeader);
  PHRASE_NORMALIZERS.forEach(([pattern, replacement]) => {
    normalized = normalized.replace(pattern, replacement);
  });
  return normalizeComparableText(normalized);
}

export function expandHeaderAliases(tokens: string[]): string[] {
  const expanded: string[] = [];
  tokens.forEach((token) => {
    expanded.push(token);
    (TAKEOFF_TOKEN_ALIAS_MAP[token] || []).forEach((alias) => {
      alias.split(/\s+/).filter(Boolean).forEach((part) => expanded.push(part));
      expanded.push(alias);
    });
  });
  return unique(expanded);
}

export function extractDimensions(tokens: string[]): { inches?: number[] } {
  const inches: number[] = [];
  tokens.forEach((token) => {
    const normalized = token.replace(/[^0-9x]/gi, '');
    if (!normalized) return;
    if (/^\d{2}$/.test(normalized)) {
      inches.push(Number(normalized));
      return;
    }
    const compound = normalized.match(/^(\d{2})(\d{2})$/);
    if (compound) {
      inches.push(Number(compound[1]), Number(compound[2]));
      return;
    }
    normalized.split('x').forEach((part) => {
      if (/^\d{2}$/.test(part)) inches.push(Number(part));
    });
  });
  return inches.length ? { inches: unique(inches.map(String)).map(Number) } : {};
}

export function interpretTakeoffHeader(rawHeader: string): HeaderInterpretation {
  const normalizedSearchText = normalizeTakeoffHeader(rawHeader);
  const parsedTokens = unique(normalizedSearchText.split(/\s+/).filter(Boolean));
  const expandedTokens = expandHeaderAliases(parsedTokens);
  const rawModelTokens = intakeAsText(rawHeader)
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => /^[A-Za-z0-9-]+$/.test(token))
    .filter((token) => /[A-Za-z]/.test(token) && (/\d/.test(token) || token.includes('-')));
  const dimensions = extractDimensions(parsedTokens);
  const categoryHint = inferCategory(expandedTokens);
  const modelTokens = unique(rawModelTokens.map((token) => token.toUpperCase()));
  const parsedFamily = inferFamily(parsedTokens, expandedTokens, modelTokens);
  const accessoryTokens = extractAccessoryTokens(parsedTokens, expandedTokens);

  return {
    rawHeader: intakeAsText(rawHeader),
    normalizedSearchText,
    parsedTokens,
    expandedTokens,
    dimensions,
    modelTokens,
    categoryHint,
    parsedFamily,
    accessoryTokens,
  };
}