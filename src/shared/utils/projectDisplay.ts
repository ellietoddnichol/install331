import type { PricingMode, ProjectRecord } from '../types/estimator';

const PLACEHOLDER_PROJECT_NAMES = new Set(['untitled project', 'untitled', 'new project', '']);

export function isPlaceholderProjectName(name: string | null | undefined): boolean {
  const normalized = String(name ?? '').trim().toLowerCase();
  return !normalized || PLACEHOLDER_PROJECT_NAMES.has(normalized);
}

/** Customer-facing project title — never shows raw "Untitled Project". */
export function projectDisplayTitle(name: string | null | undefined): string {
  if (isPlaceholderProjectName(name)) return 'New project draft';
  return String(name ?? '').trim();
}

export function proposalModeChipLabel(mode: PricingMode | string | null | undefined): string {
  const m = String(mode ?? 'labor_and_material');
  if (m === 'labor_only') return 'Install only';
  if (m === 'material_only') return 'Material only';
  return 'Full';
}

export function projectDisplaySubtitle(project: ProjectRecord): string | null {
  const customer = String(project.clientName ?? '').trim();
  const address = String(project.address ?? '').trim();
  if (customer && address) return `${customer} · ${address}`;
  if (customer) return customer;
  if (address) return address;
  return null;
}

export function projectNeedsSetupDetails(project: ProjectRecord): boolean {
  return (
    isPlaceholderProjectName(project.projectName)
    || !String(project.clientName ?? '').trim()
    || !String(project.address ?? '').trim()
  );
}

export type ProjectReadinessChipKey = 'draft' | 'setup_needed' | 'ready_for_quotes' | 'ready_for_proposal';

export function projectReadinessChip(input: {
  project: ProjectRecord;
  estimateLineCount: number;
  proposalReady: boolean;
}): { key: ProjectReadinessChipKey; label: string } {
  const { project, estimateLineCount, proposalReady } = input;
  if (proposalReady && estimateLineCount > 0) {
    return { key: 'ready_for_proposal', label: 'Ready for proposal' };
  }
  if (!projectNeedsSetupDetails(project)) {
    return { key: 'ready_for_quotes', label: 'Ready for quote import' };
  }
  if (estimateLineCount > 0) {
    return { key: 'draft', label: 'Draft' };
  }
  return { key: 'setup_needed', label: 'Setup needed' };
}

export function deleteConfirmationPhrase(projectName: string | null | undefined): string {
  return isPlaceholderProjectName(projectName) ? 'DELETE' : String(projectName ?? '').trim();
}
