import type { PricingMode, TakeoffLineRecord } from '../types/estimator';
import { isMaterialOnlyMainBid } from '../types/estimator';
import { shouldIncludeLineInEstimateHealth } from './estimateLineHealth';

/** Parsed install-intelligence markers persisted on takeoff line notes at quote import. */
export interface ParsedInstallIntelligenceNotes {
  needsReview: boolean;
  requiredQuestions: string[];
  reviewFlags: string[];
  internalNotes: string[];
  customerProposalClauses: string[];
  laborBlockedExplicit: boolean;
}

export interface InstallAssumptionGateUi {
  isGated: boolean;
  needsReview: boolean;
  badgeLabel: 'Needs Review' | 'Install assumptions needed' | null;
  blockedLaborHeadline: string;
  topMissingPrompt: string | null;
  detail: ParsedInstallIntelligenceNotes;
  isVendorLaborSuppressed: boolean;
  vendorLaborSuppressedLabel: string | null;
  suggestsProjectSetupForSubstrate: boolean;
}

export function readSourceRowTypeFromNotes(notes: string | null | undefined): string | null {
  const match = String(notes || '').match(/Source row type:\s*([a-z_]+)/i);
  return match?.[1]?.toLowerCase() ?? null;
}

export function isVendorLaborSuppressedRow(line: TakeoffLineRecord): boolean {
  const rowType = readSourceRowTypeFromNotes(line.notes);
  if (rowType === 'freight' || rowType === 'installation' || rowType === 'service') return true;
  if (line.sourceLineType === 'add_in' && rowType === 'freight') return true;
  return false;
}

export function parseInstallIntelligenceNotes(notes: string | null | undefined): ParsedInstallIntelligenceNotes {
  const parts = String(notes || '')
    .split(' | ')
    .map((p) => p.trim())
    .filter(Boolean);

  const requiredQuestions: string[] = [];
  const reviewFlags: string[] = [];
  const internalNotes: string[] = [];
  const customerProposalClauses: string[] = [];
  let needsReview = false;
  let laborBlockedExplicit = false;

  for (const part of parts) {
    if (part === 'Needs Review') {
      needsReview = true;
      continue;
    }
    if (/auto-price labor blocked/i.test(part)) {
      laborBlockedExplicit = true;
      internalNotes.push(part);
      continue;
    }
    if (part.startsWith('Install questions: ')) {
      const qs = part
        .slice('Install questions: '.length)
        .split(';')
        .map((q) => q.trim())
        .filter(Boolean);
      requiredQuestions.push(...qs);
      continue;
    }
    if (part.startsWith('Install review: ')) {
      const flags = part
        .slice('Install review: '.length)
        .split(',')
        .map((f) => f.trim())
        .filter(Boolean);
      reviewFlags.push(...flags);
      needsReview = true;
      continue;
    }
    if (part.startsWith('Proposal clause: ')) {
      customerProposalClauses.push(part.slice('Proposal clause: '.length));
      continue;
    }
    if (
      part.startsWith('Vendor normalized:')
      || part.startsWith('Vendor parser profile:')
      || part.startsWith('Internal clause')
    ) {
      internalNotes.push(part);
    }
  }

  if (requiredQuestions.length > 0 || reviewFlags.length > 0) {
    needsReview = true;
  }

  return {
    needsReview,
    requiredQuestions,
    reviewFlags,
    internalNotes,
    customerProposalClauses,
    laborBlockedExplicit,
  };
}

export function shortMissingInstallPrompt(question: string): string {
  const q = question.toLowerCase();
  if (q.includes('blocking')) return 'Confirm blocking status';
  if (q.includes('substrate')) return 'Confirm wall substrate';
  if (q.includes('compartment')) return 'Confirm compartment count';
  if (q.includes('mounting style') || q.includes('mounting')) return 'Confirm mounting style';
  if (q.includes('locker openings') || q.includes('openings')) return 'Confirm locker openings';
  if (q.includes('knocked-down') || q.includes('assembled')) return 'Confirm locker assembly status';
  if (q.includes('rough opening') || q.includes('recessed')) return 'Confirm rough opening responsibility';
  if (q.includes('linear feet') || q.includes('(lf)')) return 'Confirm wall protection quantity';
  if (q.includes('height')) return 'Confirm wall protection height';
  const trimmed = question.replace(/\?+$/, '').trim();
  if (trimmed.length <= 52) return trimmed;
  return `${trimmed.slice(0, 49)}…`;
}

function vendorSuppressedLabel(line: TakeoffLineRecord): string {
  const rowType = readSourceRowTypeFromNotes(line.notes);
  if (rowType === 'freight') return 'Freight add-in — no Brighten install labor';
  if (rowType === 'installation' || rowType === 'service') {
    return 'Vendor install/service — Brighten labor not applied';
  }
  return 'No Brighten install labor on this row';
}

export function deriveInstallAssumptionGateUi(
  line: TakeoffLineRecord,
  pricingMode: PricingMode = 'labor_and_material',
): InstallAssumptionGateUi {
  const showLabor = !isMaterialOnlyMainBid(pricingMode);
  const detail = parseInstallIntelligenceNotes(line.notes);
  const suppressed = isVendorLaborSuppressedRow(line);

  if (suppressed) {
    return {
      isGated: false,
      needsReview: false,
      badgeLabel: null,
      blockedLaborHeadline: '',
      topMissingPrompt: null,
      detail,
      isVendorLaborSuppressed: true,
      vendorLaborSuppressedLabel: vendorSuppressedLabel(line),
      suggestsProjectSetupForSubstrate: false,
    };
  }

  const laborMin = Number(line.laborMinutes) || 0;
  const hasSignals =
    detail.needsReview
    || detail.requiredQuestions.length > 0
    || detail.reviewFlags.length > 0
    || detail.laborBlockedExplicit;

  const isGated =
    showLabor
    && shouldIncludeLineInEstimateHealth(line)
    && laborMin <= 0
    && hasSignals;

  const topQuestion = detail.requiredQuestions[0] ?? null;
  const topMissingPrompt = topQuestion ? shortMissingInstallPrompt(topQuestion) : null;
  const needsSubstrate =
  detail.requiredQuestions.some((q) => /substrate/i.test(q))
    || detail.reviewFlags.some((f) => /substrate/i.test(f));

  return {
    isGated,
    needsReview: detail.needsReview,
    badgeLabel: isGated ? (detail.needsReview ? 'Needs Review' : 'Install assumptions needed') : null,
    blockedLaborHeadline: 'Labor blocked until install assumptions are confirmed.',
    topMissingPrompt,
    detail,
    isVendorLaborSuppressed: false,
    vendorLaborSuppressedLabel: null,
    suggestsProjectSetupForSubstrate: isGated && needsSubstrate,
  };
}
