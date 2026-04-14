import type {
  Div10LineBrainEvidence,
  IntakeLineEstimateSuggestion,
  IntakeParseResult,
  IntakeProposalClauseHint,
  IntakeReviewLine,
} from '../../shared/types/intake.ts';
import type { ModifierRecord } from '../../shared/types/estimator.ts';
import type { CatalogItem } from '../../types.ts';
import { readDiv10BrainEnv } from '../div10Brain/env.ts';
import { getSupabaseAdmin } from '../div10Brain/supabaseAdmin.ts';
import { classifyIntakeLine } from '../div10Brain/ai/classifyIntakeLine.ts';
import { suggestCatalogMatch } from '../div10Brain/ai/suggestCatalogMatch.ts';
import { suggestModifiers } from '../div10Brain/ai/suggestModifiers.ts';
import { retrieveKnowledge, retrieveProposalClauses } from '../div10Brain/retrieval/retrieveKnowledge.ts';

function maxDiv10Lines(): number {
  const n = Number.parseInt(process.env.INTAKE_DIV10_MAX_LINES || '10', 10);
  return Number.isFinite(n) && n > 0 ? Math.min(n, 40) : 10;
}

function mapModifierKeysToIds(keys: string[], modifiers: ModifierRecord[]): string[] {
  const byKey = new Map<string, string>();
  for (const m of modifiers) {
    const k = String(m.modifierKey || '').trim().toLowerCase();
    if (k) byKey.set(k, m.id);
  }
  const out: string[] = [];
  for (const raw of keys) {
    const id = byKey.get(String(raw).trim().toLowerCase());
    if (id) out.push(id);
  }
  return [...new Set(out)];
}

function pickLinesForDiv10(result: IntakeParseResult, max: number): IntakeLineEstimateSuggestion[] {
  const draft = result.estimateDraft;
  if (!draft) return [];
  const reviewByFp = new Map(result.reviewLines.map((r) => [r.reviewLineFingerprint, r]));
  const priced = draft.lineSuggestions.filter((r) => r.scopeBucket === 'priced_base_scope');
  const ambiguous = priced.filter((r) => {
    const rl = reviewByFp.get(r.reviewLineFingerprint);
    return rl?.matchStatus === 'needs_match' || r.catalogAutoApplyTier === 'C';
  });
  const ordered = [...ambiguous, ...priced.filter((r) => !ambiguous.includes(r))];
  const seen = new Set<string>();
  const out: IntakeLineEstimateSuggestion[] = [];
  for (const r of ordered) {
    if (out.length >= max) break;
    if (seen.has(r.reviewLineFingerprint)) continue;
    seen.add(r.reviewLineFingerprint);
    out.push(r);
  }
  return out;
}

/**
 * Adds Div 10 Brain classify / retrieval / catalog assist / modifier assist onto estimate draft rows.
 * Does not change suggestedCatalogItemId, pricing preview, or matcher picks — advisory only.
 */
export async function enrichParseResultWithDiv10Brain(
  result: IntakeParseResult,
  catalog: CatalogItem[],
  modifiers: ModifierRecord[]
): Promise<IntakeParseResult> {
  const env = readDiv10BrainEnv();
  if (!env || !result.estimateDraft) return result;

  const supabase = getSupabaseAdmin(env);
  const draft = result.estimateDraft;
  const targets = pickLinesForDiv10(result, maxDiv10Lines());
  if (!targets.length) return result;

  const reviewByFp = new Map(result.reviewLines.map((r) => [r.reviewLineFingerprint, r]));
  const catalogById = new Map(catalog.map((c) => [c.id, c]));

  const lineIndexByFp = new Map<string, number>();
  result.reviewLines.forEach((l, i) => lineIndexByFp.set(l.reviewLineFingerprint, i));

  const nextLines = draft.lineSuggestions.map((row) => ({ ...row }));

  const runOne = async (row: IntakeLineEstimateSuggestion) => {
    const idx = nextLines.findIndex((r) => r.reviewLineFingerprint === row.reviewLineFingerprint);
    if (idx < 0) return;
    const reviewLine = reviewByFp.get(row.reviewLineFingerprint) as IntakeReviewLine | undefined;
    const line_text = [reviewLine?.description, reviewLine?.itemName, reviewLine?.notes].filter(Boolean).join(' ').trim();
    if (!line_text) return;

    const i = lineIndexByFp.get(row.reviewLineFingerprint) ?? 0;
    const nearby = result.reviewLines
      .slice(Math.max(0, i - 1), i + 2)
      .map((l) => [l.itemName, l.description].filter(Boolean).join(' — '))
      .filter(Boolean);

    try {
      const { output: cls } = await classifyIntakeLine(supabase, env, {
        line_text,
        nearby_lines: nearby,
        section_header: reviewLine?.category || null,
        project_context: { projectName: result.projectMetadata?.projectName },
      });

      const retrieval = await retrieveKnowledge(supabase, env, line_text, {}, 4);
      const retrievalSlim = retrieval.map((b) => ({
        id: b.id,
        source_label: b.source_label,
        text: b.text.slice(0, 420),
        score: b.score,
      }));

      const candidates = row.topCatalogCandidates.slice(0, 6).map((c) => ({
        id: c.catalogItemId,
        sku: c.sku,
        brand: catalogById.get(c.catalogItemId)?.manufacturer ?? null,
        category: c.category ?? catalogById.get(c.catalogItemId)?.category ?? null,
        normalized_name: catalogById.get(c.catalogItemId)?.description ?? c.description ?? null,
        description: c.description ?? null,
      }));

      let catalogAssist: Div10LineBrainEvidence['catalogAssist'] = null;
      if (candidates.length) {
        const { output: catOut } = await suggestCatalogMatch(supabase, env, {
          line_text,
          candidates,
          project_context: { projectName: result.projectMetadata?.projectName },
        });
        catalogAssist = {
          rationale: catOut.rationale,
          confidence: catOut.confidence,
          selected_catalog_item_id: catOut.selected_catalog_item_id,
          alternate_catalog_item_ids: catOut.alternate_catalog_item_ids,
          needs_human_review: catOut.needs_human_review,
        };
      }

      const chosenId =
        row.suggestedCatalogItemId ||
        row.topCatalogCandidates[0]?.catalogItemId ||
        candidates[0]?.id ||
        null;
      const chosenItem = chosenId ? catalogById.get(chosenId) : undefined;
      let modifierAssist: Div10LineBrainEvidence['modifierAssist'] = null;
      if (chosenItem) {
        const { output: modOut } = await suggestModifiers(supabase, env, {
          line_text,
          chosen_item: {
            id: chosenItem.id,
            sku: chosenItem.sku,
            brand: chosenItem.manufacturer ?? null,
            category: chosenItem.category,
            normalized_name: chosenItem.description,
          },
          project_conditions: { pricingBasis: result.projectMetadata?.pricingBasis },
        });
        modifierAssist = {
          suggested_line_modifier_keys: modOut.suggested_line_modifier_keys,
          suggested_project_modifier_keys: modOut.suggested_project_modifier_keys,
          line_modifier_ids_resolved: mapModifierKeysToIds(modOut.suggested_line_modifier_keys, modifiers),
          project_modifier_ids_resolved: mapModifierKeysToIds(modOut.suggested_project_modifier_keys, modifiers),
          confidence_notes: modOut.confidence_notes,
          needs_human_review: modOut.needs_human_review,
        };
      }

      const evidence: Div10LineBrainEvidence = {
        classify: cls,
        retrieval: retrievalSlim,
        catalogAssist,
        modifierAssist,
      };

      nextLines[idx] = { ...nextLines[idx], div10Brain: evidence };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      const evidence: Div10LineBrainEvidence = {
        classify: null,
        retrieval: [],
        catalogAssist: null,
        modifierAssist: null,
        div10Error: msg,
      };
      nextLines[idx] = { ...nextLines[idx], div10Brain: evidence };
    }
  };

  for (const row of targets) {
    await runOne(row);
  }

  let div10ProposalClauseHints: IntakeProposalClauseHint[] | undefined;
  try {
    const q = [
      result.projectMetadata?.projectName,
      ...result.reviewLines.slice(0, 12).map((l) => l.description),
    ]
      .filter(Boolean)
      .join(' ')
      .slice(0, 800);
    const clauses = await retrieveProposalClauses(supabase, q || 'Division 10 scope exclusions', {}, 8);
    div10ProposalClauseHints = clauses.map((c) => ({
      id: c.id,
      clause_type: String((c.metadata as { clause_type?: string }).clause_type ?? 'clause'),
      title: ((c.metadata as { title?: string | null }).title as string) || null,
      body_preview: c.text.slice(0, 280),
    }));
  } catch {
    div10ProposalClauseHints = undefined;
  }

  return {
    ...result,
    estimateDraft: { ...draft, lineSuggestions: nextLines },
    div10ProposalClauseHints,
  };
}
