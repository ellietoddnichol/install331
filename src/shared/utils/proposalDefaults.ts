import { SettingsRecord } from '../types/estimator';

export const DEFAULT_PROPOSAL_INTRO = [
  'Brighten Builders, LLC is pleased to provide this proposal for the scope outlined in this estimate. This pricing reflects the included work items, the current project information available at the time of pricing, and the assumptions listed in this proposal.',
  'Unless specifically noted otherwise, pricing assumes standard site access, coordinated work areas, normal material handling, and one continuous mobilization for the included scope.',
].join('\n\n');

export const DEFAULT_PROPOSAL_TERMS = [
  'Pricing is valid for 30 calendar days from the proposal date unless otherwise stated in writing.',
  'Proposal pricing is based on normal working hours, reasonable site access, and installation sequencing that allows the included work to proceed efficiently.',
  'Material price escalation, freight increases, tax changes, schedule delays, or customer-directed scope revisions after proposal issuance may require a pricing adjustment.',
  'Work outside the accepted scope will be handled by written change order before execution.',
  'Applicable sales tax is included only where specifically stated in the pricing summary.',
].join('\n');

export const DEFAULT_PROPOSAL_EXCLUSIONS = [
  'Permits, permit fees, bonds, special inspections, and testing unless specifically included in the scope.',
  'Patch, paint, wall repair, ceiling repair, and finish touch-up by others unless specifically included.',
  'Electrical rough-in, dedicated power, low-voltage wiring, backing, blocking, and structural support unless specifically included.',
  'Unforeseen field conditions, concealed conditions, hazardous materials abatement, and code-required upgrades not shown in the bid documents.',
  'Demolition, removals, disposal, and temporary protection except where specifically described in the included scope.',
  'Off-hours work, overtime, phased turnover, premium access logistics, and additional mobilizations unless specifically included.',
].join('\n');

export const DEFAULT_PROPOSAL_CLARIFICATIONS = [
  'This proposal is based on the drawings, specifications, and other bid information made available at the time of pricing; final field verification remains required before release for fabrication or installation.',
  'Quantities, room names, and scope descriptions should be reviewed against final approved construction documents; revisions in scope, layout, or quantity may require updated pricing.',
  'Installation assumptions are based on substrate and field conditions being suitable for the specified products and methods of installation unless specifically noted otherwise.',
  'Material lead times, procurement timing, and installation schedule remain subject to final release dates and project coordination by others.',
  'This proposal includes only the listed scope categories and accepted estimate items shown in this submission.',
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