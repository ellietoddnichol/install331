import { SettingsRecord } from '../types/estimator';
import { isPlausibleCustomerFacingProposalText } from './intakeTextGuards';

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

function sanitizeProposalTextField(
  value: string | null | undefined,
  isPlaceholder: boolean,
  fallback: string
): string {
  const normalized = isPlaceholder ? fallback : normalizeValue(value);
  return isPlausibleCustomerFacingProposalText(normalized) ? normalized : fallback;
}

export function sanitizeProposalSettings(input: Partial<SettingsRecord>): Partial<SettingsRecord> {
  const proposalIntro = sanitizeProposalTextField(
    input.proposalIntro,
    isPlaceholderValue(input.proposalIntro, PLACEHOLDER_INTROS),
    DEFAULT_PROPOSAL_INTRO
  );
  const proposalTerms = sanitizeProposalTextField(
    input.proposalTerms,
    isPlaceholderValue(input.proposalTerms, PLACEHOLDER_TERMS),
    DEFAULT_PROPOSAL_TERMS
  );
  const proposalExclusions = sanitizeProposalTextField(
    input.proposalExclusions,
    isPlaceholderValue(input.proposalExclusions, PLACEHOLDER_EXCLUSIONS),
    DEFAULT_PROPOSAL_EXCLUSIONS
  );
  const proposalClarifications = sanitizeProposalTextField(
    input.proposalClarifications,
    isPlaceholderValue(input.proposalClarifications, PLACEHOLDER_CLARIFICATIONS),
    DEFAULT_PROPOSAL_CLARIFICATIONS
  );
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
  const mode = settings.intakeCatalogAutoApplyMode ?? 'off';
  const tier =
    typeof settings.intakeCatalogTierAMinScore === 'number' && Number.isFinite(settings.intakeCatalogTierAMinScore)
      ? settings.intakeCatalogTierAMinScore
      : 0.82;
  const sanitized = sanitizeProposalSettings({
    ...settings,
    intakeCatalogAutoApplyMode: mode,
    intakeCatalogTierAMinScore: tier,
  }) as SettingsRecord;
  return { ...sanitized, intakeCatalogAutoApplyMode: mode, intakeCatalogTierAMinScore: tier };
}