import { SettingsRecord } from '../types/estimator';

export const DEFAULT_PROPOSAL_INTRO =
  'Furnish and install Division 10 per bid documents and field conditions. Quantities and pricing are summarized below.';

export const DEFAULT_PROPOSAL_TERMS =
  'Valid 30 days. Material and labor shown separately. Duration in project totals (days/weeks).';

export const DEFAULT_PROPOSAL_EXCLUSIONS =
  'Excludes permits, bonds, fees, patch/paint, other trades, and electrical/structural unless noted.';

export const DEFAULT_PROPOSAL_CLARIFICATIONS =
  'Items show name and qty. Scope changes may affect price. Field verify before fabrication/install.';

export const DEFAULT_PROPOSAL_ACCEPTANCE_LABEL = 'Accepted by / title';

const PLACEHOLDER_INTROS = new Set(['custom intro', 'proposal intro', 'scope summary']);
const PLACEHOLDER_TERMS = new Set(['custom terms', 'terms']);
const PLACEHOLDER_EXCLUSIONS = new Set(['exclusion x', 'exclusions']);
const PLACEHOLDER_CLARIFICATIONS = new Set(['clarification y', 'clarifications']);
const PLACEHOLDER_ACCEPTANCE_LABELS = new Set(['accepted name', 'accepted by', 'accepted by name']);

function normalizeValue(value: string | null | undefined): string {
  return String(value || '').trim();
}

function isPlaceholderValue(value: string | null | undefined, placeholders: Set<string>): boolean {
  const normalized = normalizeValue(value).toLowerCase();
  return !normalized || placeholders.has(normalized);
}

export function sanitizeProposalSettings(input: Partial<SettingsRecord>): Partial<SettingsRecord> {
  const proposalIntro = isPlaceholderValue(input.proposalIntro, PLACEHOLDER_INTROS) ? DEFAULT_PROPOSAL_INTRO : normalizeValue(input.proposalIntro);
  const proposalTerms = isPlaceholderValue(input.proposalTerms, PLACEHOLDER_TERMS) ? DEFAULT_PROPOSAL_TERMS : normalizeValue(input.proposalTerms);
  const proposalExclusions = isPlaceholderValue(input.proposalExclusions, PLACEHOLDER_EXCLUSIONS) ? DEFAULT_PROPOSAL_EXCLUSIONS : normalizeValue(input.proposalExclusions);
  const proposalClarifications = isPlaceholderValue(input.proposalClarifications, PLACEHOLDER_CLARIFICATIONS) ? DEFAULT_PROPOSAL_CLARIFICATIONS : normalizeValue(input.proposalClarifications);
  const proposalAcceptanceLabel = isPlaceholderValue(input.proposalAcceptanceLabel, PLACEHOLDER_ACCEPTANCE_LABELS)
    ? DEFAULT_PROPOSAL_ACCEPTANCE_LABEL
    : normalizeValue(input.proposalAcceptanceLabel);

  return {
    ...input,
    proposalIntro,
    proposalTerms,
    proposalExclusions,
    proposalClarifications,
    proposalAcceptanceLabel,
  };
}

export function ensureProposalDefaults(settings: SettingsRecord): SettingsRecord {
  return sanitizeProposalSettings(settings) as SettingsRecord;
}