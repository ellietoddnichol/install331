import { SettingsRecord } from '../types/estimator';

export const DEFAULT_PROPOSAL_INTRO = [
  'Thank you for the opportunity to provide pricing for this project. Brighten Builders, LLC is pleased to submit this proposal covering the furnishing and/or installation of the included scope as described herein.',
  'This proposal is based on the current plans, specifications, and other project information made available at the time of bidding, together with normal site access, standard material handling, and coordinated area availability unless specifically noted otherwise.',
].join('\n\n');

export const DEFAULT_PROPOSAL_TERMS = [
  'Pricing is valid for 30 calendar days from the proposal date unless otherwise noted.',
  'Payment terms are net 30 from invoice date for approved accounts unless superseded by an executed subcontract or master agreement.',
  'Proposal pricing is based on normal working hours, reasonable site access, and installation sequencing that allows the included work to proceed in an efficient and continuous manner.',
  'Material price escalation, freight increases, tax changes, schedule delays, or customer-directed scope revisions after proposal issue may require pricing adjustment.',
  'Any work requested outside the accepted scope will be handled by written change order before execution.',
  'Applicable sales tax is included only as specifically stated in the proposal pricing summary.',
].join('\n');

export const DEFAULT_PROPOSAL_EXCLUSIONS = [
  'Permits, permit fees, special inspections, bonds, and testing unless specifically included.',
  'Patch, paint, wall repair, ceiling repair, and finish touch-up by others unless specifically included.',
  'Electrical rough-in, dedicated power, low-voltage wiring, backing, blocking, and structural support unless specifically included.',
  'Unforeseen field conditions, concealed conditions, hazardous materials abatement, and code upgrades not shown in the bid documents.',
  'Demolition, removals, disposal, and temporary protection except as specifically described in the included scope.',
  'Off-hours work, overtime, premium time, phased turnover, premium access logistics, and multiple mobilizations unless specifically included.',
].join('\n');

export const DEFAULT_PROPOSAL_CLARIFICATIONS = [
  'Proposal is based on the drawings, specifications, and other bid information made available at the time of pricing; final field verification remains required before release for fabrication or installation.',
  'Pricing assumes reasonable site access, staging space, and one coordinated mobilization unless noted otherwise.',
  'Quantities, room names, and scope descriptions should be reviewed against final approved construction documents; changes in scope, layout, or quantities may require revised pricing.',
  'Installation assumptions are based on substrate and field conditions being suitable for the specified products and methods of installation unless specifically noted otherwise.',
  'Material lead times, procurement timing, and installation schedule are subject to final approval timing, release dates, and project coordination by others.',
  'This proposal reflects only the listed scope categories and accepted estimate items included in this submission.',
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