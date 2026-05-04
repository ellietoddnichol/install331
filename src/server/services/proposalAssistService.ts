import type { IntakeProjectAssumption, IntakeProjectMetadata, IntakeProposalAssist } from '../../shared/types/intake.ts';
import {
  isPlausibleCustomerFacingProposalText,
  isPlausibleProposalScopeSnippet,
} from '../../shared/utils/intakeTextGuards.ts';

function asText(value: unknown): string {
  return String(value ?? '').trim();
}

function uniqueAssumptions(input: IntakeProjectAssumption[]): IntakeProjectAssumption[] {
  const seen = new Set<string>();
  const output: IntakeProjectAssumption[] = [];
  for (const assumption of input) {
    const kind = asText(assumption.kind);
    const text = asText(assumption.text);
    if (!kind || !text) continue;
    const key = `${kind}|${text.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    output.push({
      kind: assumption.kind,
      text,
      confidence: Number.isFinite(assumption.confidence) ? Math.max(0, Math.min(1, assumption.confidence)) : 0.5,
    });
  }
  return output;
}

export function extractAssumptionsFromText(text: string): IntakeProjectAssumption[] {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).slice(0, 240);
  const output: IntakeProjectAssumption[] = [];
  const pushMatches = (kind: IntakeProjectAssumption['kind'], pattern: RegExp, confidence: number) => {
    lines.forEach((line) => {
      if (pattern.test(line)) output.push({ kind, text: line, confidence });
    });
  };

  pushMatches('tax', /tax|sales tax/i, 0.72);
  pushMatches('delivery', /delivery|freight|unload|offload/i, 0.72);
  pushMatches('bond', /bond|bonding/i, 0.72);
  pushMatches('shipment', /shipment|ship(?:ping)?/i, 0.7);
  pushMatches('site_visit', /site visit|field verify|field measure|job walk/i, 0.7);
  pushMatches('clarification', /clarif/i, 0.65);
  pushMatches('exclusion', /exclusion|excluded|not included/i, 0.68);
  pushMatches('alternate', /alternate|option|add alternate|deduct alternate/i, 0.66);

  return uniqueAssumptions(output);
}

export function inferPricingBasis(text: string, lineUnits: string[], geminiValue?: string): IntakeProjectMetadata['pricingBasis'] {
  const normalizedGemini = asText(geminiValue).toLowerCase();
  if (
    normalizedGemini === 'material_only' ||
    normalizedGemini === 'labor_only' ||
    normalizedGemini === 'labor_and_material' ||
    normalizedGemini === 'material_with_optional_install_quote'
  ) {
    return normalizedGemini as IntakeProjectMetadata['pricingBasis'];
  }

  const normalized = text.toLowerCase();
  // Classic "material-led bid; install quoted separately" language on vendor quotes.
  if (
    /labor (?:is )?(?:separate|by others|quoted separately)|install (?:is )?(?:separate|quoted separately|by others)|if labor is needed[, ]+call for quote|call for (?:a )?labor quote|labor (?:by )?quote/.test(
      normalized
    )
  ) {
    return 'material_with_optional_install_quote';
  }
  if (/material only|furnish only|supply only/.test(normalized)) return 'material_only';
  if (/install only|labor only/.test(normalized)) return 'labor_only';
  if (/furnish and install|material and labor|labor and material/.test(normalized)) return 'labor_and_material';
  if (lineUnits.some((unit) => ['HR', 'DAY'].includes(unit.toUpperCase()))) return 'labor_and_material';
  return '';
}

export function buildProposalAssist(input: {
  metadata: IntakeProjectMetadata;
  assumptions: IntakeProjectAssumption[];
  lineDescriptions: string[];
  geminiAssist?: Partial<IntakeProposalAssist> | null;
}): IntakeProposalAssist {
  const scopeLines = input.lineDescriptions
    .filter(Boolean)
    .filter((d) => isPlausibleProposalScopeSnippet(d))
    .slice(0, 6);

  const geminiScope = asText(input.geminiAssist?.scopeSummaryDraft);
  const safeGeminiScope = geminiScope && isPlausibleCustomerFacingProposalText(geminiScope) ? geminiScope : '';

  const mechanicalScope =
    scopeLines.length > 0 ? `Scope appears to include ${scopeLines.join('; ')}.` : '';
  const scopeSummaryDraft = safeGeminiScope || mechanicalScope;

  const geminiIntro = asText(input.geminiAssist?.introDraft);
  const safeGeminiIntro = geminiIntro && isPlausibleCustomerFacingProposalText(geminiIntro) ? geminiIntro : '';

  const fallbackIntro = [
    input.metadata.projectName ? `Proposal for ${input.metadata.projectName}.` : '',
    input.metadata.client ? `Prepared for ${input.metadata.client}.` : '',
    scopeSummaryDraft,
  ]
    .filter(Boolean)
    .join(' ');

  const introDraft = safeGeminiIntro || fallbackIntro;

  const clarificationsDraft = asText(input.geminiAssist?.clarificationsDraft) || input.assumptions
    .filter((assumption) => assumption.kind === 'clarification' || assumption.kind === 'site_visit')
    .map((assumption) => assumption.text)
    .join('\n');

  const exclusionsDraft = asText(input.geminiAssist?.exclusionsDraft) || input.assumptions
    .filter((assumption) => assumption.kind === 'exclusion' || assumption.kind === 'alternate')
    .map((assumption) => assumption.text)
    .join('\n');

  return {
    introDraft,
    scopeSummaryDraft,
    clarificationsDraft,
    exclusionsDraft,
  };
}

export function mergeAssumptions(primary: IntakeProjectAssumption[], secondary: IntakeProjectAssumption[]): IntakeProjectAssumption[] {
  return uniqueAssumptions([...primary, ...secondary]);
}
