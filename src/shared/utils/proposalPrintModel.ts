import type { EstimateSummary, ProjectRecord, SettingsRecord, TakeoffLineRecord } from '../types/estimator';
import { isMaterialOnlyMainBid } from '../types/estimator';
import {
  buildClientFacingInvestmentBreakdownRows,
  buildProposalScheduleSections,
  buildProposalScopeBreakout,
  filterLinesForClientProposal,
  splitProposalTextLines,
  type ProposalScheduleItem,
} from './proposalDocument';
import {
  DEFAULT_PROPOSAL_ACCEPTANCE_LABEL,
  DEFAULT_PROPOSAL_CLARIFICATIONS,
  DEFAULT_PROPOSAL_EXCLUSIONS,
  DEFAULT_PROPOSAL_INTRO,
  DEFAULT_PROPOSAL_TERMS,
  ensureProposalDefaults,
} from './proposalDefaults';
import { formatNumberSafe } from '../../utils/numberFormat';

export type ProposalOutputFormat = 'summary' | 'detailed';

export interface ProposalOutputOptions {
  format: ProposalOutputFormat;
  showLinePricing: boolean;
  showQuantities: boolean;
  showAlternates: boolean;
  showClarifications: boolean;
  showExclusions: boolean;
  showTerms: boolean;
  includeSignatureBlock: boolean;
  includeCompanyHeader: boolean;
}

export const DEFAULT_PROPOSAL_OUTPUT_OPTIONS: ProposalOutputOptions = {
  format: 'detailed',
  showLinePricing: true,
  showQuantities: true,
  showAlternates: false,
  showClarifications: true,
  showExclusions: true,
  showTerms: true,
  includeSignatureBlock: true,
  includeCompanyHeader: true,
};

export interface ProposalPrintLine {
  id: string;
  description: string;
  subtitle: string | null;
  quantity: number | null;
  unit: string | null;
  extensionAmount: number | null;
}

export interface ProposalPrintSection {
  section: string;
  sectionTotal: number;
  lineCount: number;
  lines: ProposalPrintLine[];
}

export interface ProposalPrintScopeRollup {
  section: string;
  itemCount: number;
  total: number;
}

export interface ProposalPrintAlternate {
  id: string;
  description: string;
  subtitle: string | null;
  quantity: number | null;
  unit: string | null;
  extensionAmount: number | null;
}

export interface ProposalPrintInvestmentRow {
  label: string;
  amount: number;
  isTotal?: boolean;
  isSectionBreak?: boolean;
}

export interface ProposalPrintModel {
  companyName: string;
  companyLogoUrl: string | null;
  companyPhone: string | null;
  companyEmail: string | null;
  companyAddress: string | null;
  proposalTitle: string;
  projectName: string;
  clientName: string | null;
  projectAddress: string | null;
  proposalDate: string;
  scopeSummary: string;
  format: ProposalOutputFormat;
  showLinePricing: boolean;
  showQuantities: boolean;
  sections: ProposalPrintSection[];
  scopeRollups: ProposalPrintScopeRollup[];
  alternates: ProposalPrintAlternate[];
  investmentRows: ProposalPrintInvestmentRow[];
  durationLabel: string;
  terms: string[];
  exclusions: string[];
  clarifications: string[];
  acceptanceLabel: string;
  showTerms: boolean;
  showExclusions: boolean;
  showClarifications: boolean;
  includeSignatureBlock: boolean;
  includeCompanyHeader: boolean;
  specialNotes: string | null;
}

export interface BuildProposalPrintModelInput {
  project: ProjectRecord;
  settings: SettingsRecord | null;
  lines: TakeoffLineRecord[];
  summary: EstimateSummary;
  options: ProposalOutputOptions;
  catalogImageById?: ReadonlyMap<string, string> | null;
}

function formatDurationLabel(durationDays: number, totalLaborHours: number): string {
  const resolvedDays =
    Number.isFinite(durationDays) && durationDays > 0
      ? durationDays
      : Number.isFinite(totalLaborHours) && totalLaborHours > 0
        ? totalLaborHours / 8
        : 0;
  if (!resolvedDays) return 'TBD';
  if (resolvedDays >= 5) {
    const weeks = Math.floor(resolvedDays / 5);
    const days = Math.round((resolvedDays % 5) * 10) / 10;
    if (days <= 0) return `${formatNumberSafe(weeks, 0)} week${weeks === 1 ? '' : 's'}`;
    return `${formatNumberSafe(weeks, 0)} week${weeks === 1 ? '' : 's'} ${formatNumberSafe(days, 1)} day${days === 1 ? '' : 's'}`;
  }
  return `${formatNumberSafe(resolvedDays, 1)} day${resolvedDays === 1 ? '' : 's'}`;
}

function resolveProposalDate(project: ProjectRecord): string {
  const activeProjectDate = project.bidDate || project.proposalDate || project.dueDate;
  return activeProjectDate ? new Date(activeProjectDate).toLocaleDateString() : new Date().toLocaleDateString();
}

function resolveScopeSummary(settings: SettingsRecord | null): string {
  const intro = settings?.proposalIntro || DEFAULT_PROPOSAL_INTRO;
  return (
    intro
      .split(/\n\n+/)
      .map((paragraph) => paragraph.trim())
      .filter(Boolean)[0] || DEFAULT_PROPOSAL_INTRO
  );
}

function mapScheduleItemToPrintLine(
  item: ProposalScheduleItem,
  options: ProposalOutputOptions
): ProposalPrintLine {
  const extension = Number((item.materialCost + item.laborCost).toFixed(2));
  return {
    id: item.id,
    description: item.description,
    subtitle: item.subtitle,
    quantity: options.showQuantities ? item.quantity : null,
    unit: options.showQuantities ? item.unit : null,
    extensionAmount: options.showLinePricing ? extension : null,
  };
}

/** Reuses client proposal filters; alternates are optional_or_alt lines that would pass if included. */
export function filterAlternateLinesForClientProposal(lines: TakeoffLineRecord[]): TakeoffLineRecord[] {
  const alternates = lines.filter((line) => (line.proposalVisibility ?? 'customer_visible') === 'optional_or_alt');
  return filterLinesForClientProposal(
    alternates.map((line) => ({ ...line, proposalVisibility: 'customer_visible' as const }))
  );
}

export function buildProposalPrintModel(input: BuildProposalPrintModelInput): ProposalPrintModel {
  const { project, settings, lines, summary, options, catalogImageById = null } = input;
  const proposalSettings = ensureProposalDefaults(settings);
  const pricingMode = project.pricingMode || 'labor_and_material';
  const showMaterial = pricingMode !== 'labor_only';
  const showLabor = !isMaterialOnlyMainBid(pricingMode);
  const laborMultiplier = summary.conditionLaborHoursMultiplier || 1;

  const clientLines = filterLinesForClientProposal(lines);
  const scheduleSections = buildProposalScheduleSections(
    clientLines,
    showMaterial,
    showLabor,
    laborMultiplier,
    catalogImageById,
    'cost_bucket'
  );

  const sections: ProposalPrintSection[] = scheduleSections.map((section) => ({
    section: section.section,
    sectionTotal: section.sectionTotal,
    lineCount: section.items.length,
    lines:
      options.format === 'detailed'
        ? section.items.map((item) => mapScheduleItemToPrintLine(item, options))
        : [],
  }));

  const scopeRollups: ProposalPrintScopeRollup[] = buildProposalScopeBreakout(clientLines, showMaterial, showLabor).map(
    (rollup) => ({
      section: rollup.section,
      itemCount: rollup.itemCount,
      total: Number(rollup.total.toFixed(2)),
    })
  );

  const alternateLines = options.showAlternates ? filterAlternateLinesForClientProposal(lines) : [];
  const alternateSections = buildProposalScheduleSections(
    alternateLines,
    showMaterial,
    showLabor,
    laborMultiplier,
    catalogImageById,
    'cost_bucket'
  );
  const alternates: ProposalPrintAlternate[] = alternateSections.flatMap((section) =>
    section.items.map((item) => ({
      id: `alt-${item.id}`,
      ...mapScheduleItemToPrintLine(item, options),
    }))
  );

  const specialNotes =
    project.proposalIncludeSpecialNotes && project.specialNotes?.trim() ? project.specialNotes.trim() : null;

  return {
    companyName: proposalSettings.companyName || 'Brighten Builders',
    companyLogoUrl: options.includeCompanyHeader ? proposalSettings.logoUrl?.trim() || null : null,
    companyPhone: proposalSettings.companyPhone?.trim() || null,
    companyEmail: proposalSettings.companyEmail?.trim() || null,
    companyAddress: proposalSettings.companyAddress?.trim() || null,
    proposalTitle: 'Proposal',
    projectName: project.projectName,
    clientName: project.clientName?.trim() || null,
    projectAddress: project.address?.trim() || null,
    proposalDate: resolveProposalDate(project),
    scopeSummary: resolveScopeSummary(settings),
    format: options.format,
    showLinePricing: options.showLinePricing,
    showQuantities: options.showQuantities,
    sections,
    scopeRollups,
    alternates,
    investmentRows: buildClientFacingInvestmentBreakdownRows(summary, pricingMode),
    durationLabel: formatDurationLabel(summary.durationDays, summary.totalLaborHours),
    terms: options.showTerms
      ? splitProposalTextLines(proposalSettings.proposalTerms || DEFAULT_PROPOSAL_TERMS)
      : [],
    exclusions: options.showExclusions
      ? splitProposalTextLines(proposalSettings.proposalExclusions || DEFAULT_PROPOSAL_EXCLUSIONS)
      : [],
    clarifications: options.showClarifications
      ? splitProposalTextLines(proposalSettings.proposalClarifications || DEFAULT_PROPOSAL_CLARIFICATIONS)
      : [],
    acceptanceLabel: proposalSettings.proposalAcceptanceLabel || DEFAULT_PROPOSAL_ACCEPTANCE_LABEL,
    showTerms: options.showTerms,
    showExclusions: options.showExclusions,
    showClarifications: options.showClarifications,
    includeSignatureBlock: options.includeSignatureBlock,
    includeCompanyHeader: options.includeCompanyHeader,
    specialNotes,
  };
}
