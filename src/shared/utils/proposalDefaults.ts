import { SettingsRecord } from '../types/estimator';

export const DEFAULT_PROPOSAL_INTRO = [
  'We are pleased to submit pricing for the listed scope of work.',
  'This proposal is based on the current bid documents, field conditions represented at bid time, and the inclusions shown in the attached schedule.',
].join('\n\n');

export const DEFAULT_PROPOSAL_TERMS = [
  'Pricing is valid for 30 days.',
  'Work outside this scope will be handled by written change order.',
  'Pricing assumes normal working hours and standard site access.',
].join('\n');

export const DEFAULT_PROPOSAL_EXCLUSIONS = [
  'Permits, testing, bonds, and fees unless specifically included.',
  'Patch, paint, finish repair, and other trade work unless specifically included.',
  'Electrical, blocking, backing, and structural support unless specifically included.',
].join('\n');

export const DEFAULT_PROPOSAL_CLARIFICATIONS = [
  'Pricing is based on the current bid documents provided.',
  'Final field verification is required before fabrication, release, or installation.',
  'Scope or quantity changes may require revised pricing.',
].join('\n');

export const DEFAULT_PROPOSAL_ACCEPTANCE_LABEL = 'Accepted By / Title';

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