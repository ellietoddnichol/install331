/**
 * Match intake lines (especially room + scope text) to catalog bundles for review/import hints.
 */
import type { BundleRecord } from '../../../shared/types/estimator.ts';
import type { IntakeBundleMatch, IntakeMatchConfidence } from '../../../shared/types/intake.ts';
import { normalizeComparableText } from '../metadataExtractorService.ts';

export interface BundleMatchInput {
  roomName: string;
  itemName: string;
  description: string;
  category: string;
  /** Heuristic slugs from parser, e.g. restroom-accessories */
  bundleCandidates: string[];
}

function meaningfulTokens(text: string): Set<string> {
  const stop = new Set(['the', 'and', 'for', 'per', 'each', 'room', 'area', 'zone', 'general', 'all']);
  return new Set(
    normalizeComparableText(text)
      .split(/\s+/)
      .filter((t) => t.length > 2 && !stop.has(t))
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter += 1;
  const union = a.size + b.size - inter;
  return union ? inter / union : 0;
}

function hintBoost(hints: string[], bundle: BundleRecord): number {
  const hay = `${bundle.bundleName} ${bundle.category || ''}`.toLowerCase();
  let boost = 0;
  if (hints.includes('restroom-accessories') && /(restroom|toilet|bath|lav|washroom|urinal)/.test(hay)) boost += 0.22;
  if (hints.includes('signage-standard') && /(sign|letter|ada|wayfinding)/.test(hay)) boost += 0.22;
  if (hints.includes('locker-room-starter') && /locker/.test(hay)) boost += 0.22;
  return Math.min(0.28, boost);
}

/**
 * Score how well a line's room + text aligns with a catalog bundle (name/category).
 */
export function scoreBundleForIntakeLine(input: BundleMatchInput, bundle: BundleRecord): number {
  const room = meaningfulTokens(input.roomName);
  const desc = meaningfulTokens(`${input.itemName} ${input.description}`);
  const cat = meaningfulTokens(input.category);
  const bName = meaningfulTokens(bundle.bundleName);
  const bCat = meaningfulTokens(bundle.category || '');

  const roomNameOverlap = jaccard(room, bName);
  const roomCatOverlap = jaccard(room, bCat);
  const descNameOverlap = jaccard(desc, bName);
  const descBundleHay = jaccard(desc, new Set([...bName, ...bCat]));
  const catOverlap = jaccard(cat, bCat);

  let score =
    roomNameOverlap * 0.5 +
    roomCatOverlap * 0.16 +
    descNameOverlap * 0.12 +
    descBundleHay * 0.12 +
    catOverlap * 0.1;

  score += hintBoost(input.bundleCandidates, bundle);

  return Math.min(1, score);
}

function toConfidence(score: number): IntakeMatchConfidence {
  if (score >= 0.52) return 'strong';
  if (score >= 0.34) return 'possible';
  return 'none';
}

export function prepareBundleMatch(
  input: BundleMatchInput,
  bundles: BundleRecord[]
): { bundleMatch: IntakeBundleMatch | null; suggestedBundle: IntakeBundleMatch | null } {
  if (!bundles.length) return { bundleMatch: null, suggestedBundle: null };

  const scored = bundles
    .map((bundle) => {
      const score = scoreBundleForIntakeLine(input, bundle);
      const confidence = toConfidence(score);
      const reason = buildBundleReason(input, bundle, score);
      const match: IntakeBundleMatch = {
        bundleId: bundle.id,
        bundleName: bundle.bundleName,
        category: bundle.category ?? null,
        score: Number(score.toFixed(3)),
        confidence,
        reason,
      };
      return { bundle, match, score };
    })
    .filter((entry) => entry.score >= 0.22)
    .sort((a, b) => b.score - a.score);

  if (!scored.length) return { bundleMatch: null, suggestedBundle: null };

  const best = scored[0]!;
  if (best.match.confidence === 'strong') {
    return { bundleMatch: best.match, suggestedBundle: null };
  }
  if (best.match.confidence === 'possible') {
    return { bundleMatch: null, suggestedBundle: best.match };
  }
  return { bundleMatch: null, suggestedBundle: best.match };
}

function buildBundleReason(input: BundleMatchInput, bundle: BundleRecord, score: number): string {
  const parts: string[] = [];
  const r = meaningfulTokens(input.roomName);
  const bn = meaningfulTokens(bundle.bundleName);
  const inter = [...r].filter((t) => bn.has(t));
  if (inter.length) parts.push(`Shared terms: ${inter.slice(0, 5).join(', ')}`);
  if (input.bundleCandidates.length) parts.push(`Parser hints: ${input.bundleCandidates.join(', ')}`);
  parts.push(`Score ${score.toFixed(2)}`);
  return parts.join('; ') || 'Token overlap with bundle name/category.';
}
