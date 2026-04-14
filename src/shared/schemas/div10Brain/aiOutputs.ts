import { z } from 'zod';

/** classifyIntakeLine — strict JSON contract (validated after model). */
export const ClassifyIntakeLineOutputSchema = z.object({
  line_kind: z.string(),
  scope_bucket: z.string(),
  category: z.string(),
  subcategory: z.string().optional().nullable(),
  pricing_role: z.string(),
  likely_needs_catalog_match: z.boolean(),
  likely_modifier_keys: z.array(z.string()),
  needs_human_review: z.boolean(),
  reasoning_summary: z.string(),
});
export type ClassifyIntakeLineOutput = z.infer<typeof ClassifyIntakeLineOutputSchema>;

/** Candidate ids may be Supabase UUIDs or app SQLite catalog ids — model must pick only from the provided list. */
export const SuggestCatalogMatchOutputSchema = z.object({
  selected_catalog_item_id: z.string().nullable(),
  confidence: z.enum(['high', 'medium', 'low', 'none']),
  alternate_catalog_item_ids: z.array(z.string()),
  rationale: z.string(),
  needs_human_review: z.boolean(),
});
export type SuggestCatalogMatchOutput = z.infer<typeof SuggestCatalogMatchOutputSchema>;

export const SuggestModifiersOutputSchema = z.object({
  suggested_line_modifier_keys: z.array(z.string()),
  suggested_project_modifier_keys: z.array(z.string()),
  confidence_notes: z.string(),
  needs_human_review: z.boolean(),
});
export type SuggestModifiersOutput = z.infer<typeof SuggestModifiersOutputSchema>;

export const DraftProposalTextOutputSchema = z.object({
  scope_text: z.string(),
  clarifications: z.string(),
  exclusions: z.string(),
  assumptions: z.string(),
});
export type DraftProposalTextOutput = z.infer<typeof DraftProposalTextOutputSchema>;

export type RetrievedContextBlock = {
  id: string;
  text: string;
  source_label: string;
  metadata: Record<string, unknown>;
  score: number;
};
