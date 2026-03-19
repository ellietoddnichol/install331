import type { IntakeProjectAssumption, IntakeProjectMetadata, IntakeProposalAssist } from '../../shared/types/intake.ts';

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
  if (normalizedGemini === 'material_only' || normalizedGemini === 'labor_only' || normalizedGemini === 'labor_and_material') {
    return normalizedGemini as IntakeProjectMetadata['pricingBasis'];
  }

  const normalized = text.toLowerCase();
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
  const scopeLines = input.lineDescriptions.filter(Boolean).slice(0, 6);
  const scopeSummaryDraft = asText(input.geminiAssist?.scopeSummaryDraft) || (scopeLines.length > 0 ? `Scope appears to include ${scopeLines.join('; ')}.` : '');
  const introDraft = asText(input.geminiAssist?.introDraft) || [
    input.metadata.projectName ? `Proposal for ${input.metadata.projectName}.` : '',
    input.metadata.client ? `Prepared for ${input.metadata.client}.` : '',
    scopeSummaryDraft,
  ].filter(Boolean).join(' ');

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
