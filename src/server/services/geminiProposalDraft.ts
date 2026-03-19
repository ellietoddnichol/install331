import { GoogleGenAI, Type } from '@google/genai';
import { ProjectRecord, SettingsRecord, TakeoffLineRecord } from '../../shared/types/estimator.ts';
import { DEFAULT_PROPOSAL_ACCEPTANCE_LABEL, DEFAULT_PROPOSAL_CLARIFICATIONS, DEFAULT_PROPOSAL_EXCLUSIONS, DEFAULT_PROPOSAL_INTRO, DEFAULT_PROPOSAL_TERMS } from '../../shared/utils/proposalDefaults.ts';

interface ProposalDraftInput {
  mode?: 'scope_summary' | 'proposal_text' | 'terms_and_conditions' | 'default_short';
  project?: ProjectRecord;
  lines?: TakeoffLineRecord[];
  summary?: {
    materialSubtotal: number;
    laborSubtotal: number;
    adjustedLaborSubtotal: number;
    totalLaborHours: number;
    durationDays: number;
    lineSubtotal: number;
    conditionAdjustmentAmount: number;
    conditionLaborMultiplier: number;
    burdenAmount: number;
    overheadAmount: number;
    profitAmount: number;
    taxAmount: number;
    baseBidTotal: number;
    conditionAssumptions: string[];
  } | null;
  settings?: Partial<SettingsRecord>;
}

function asText(value: unknown): string {
  return String(value ?? '').trim();
}

function summarizeLines(lines: TakeoffLineRecord[]): Array<Record<string, unknown>> {
  return lines
    .slice()
    .sort((left, right) => right.lineTotal - left.lineTotal)
    .slice(0, 60)
    .map((line) => ({
      room: line.roomId,
      category: line.category || '',
      description: line.description,
      qty: line.qty,
      unit: line.unit,
      materialCost: line.materialCost,
      laborMinutes: line.laborMinutes,
      lineTotal: line.lineTotal,
      notes: line.notes || '',
    }));
}

export async function generateProposalDraftFromGemini(input: ProposalDraftInput): Promise<Partial<SettingsRecord>> {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_GEMINI_API_KEY || '';
  if (!apiKey) {
    throw new Error('Gemini proposal drafting is not configured. Set GEMINI_API_KEY or GOOGLE_GEMINI_API_KEY.');
  }

  if (!input.project) {
    throw new Error('project is required.');
  }

  const ai = new GoogleGenAI({ apiKey });
  const mode = input.mode || 'default_short';
  const lines = Array.isArray(input.lines) ? input.lines : [];
  const assumptions = Array.isArray(input.summary?.conditionAssumptions) ? input.summary?.conditionAssumptions : [];

  const prompt = [
    'You are a construction estimator proposal writing assistant.',
    'Draft concise, professional proposal language from the estimate data provided.',
    'Use the estimate data as source material. Do not invent scope that is not supported by the input.',
    'Keep the language client-facing and commercially usable.',
    'Keep all wording short, plain, and easy to scan.',
    'Avoid long paragraphs, legal boilerplate, and repetitive phrasing.',
    mode === 'scope_summary'
      ? 'Focus on drafting a short scope summary for the proposal intro field. Use no more than two short sentences.'
      : mode === 'default_short'
        ? 'Draft a short default proposal pack. Keep the intro to one short paragraph. Keep terms, exclusions, and clarifications to three short lines each. Return a short acceptance label suitable for signature.'
      : mode === 'terms_and_conditions'
        ? 'Improve the proposal terms, exclusions, and clarifications using the estimate scope and project assumptions. Keep them short and practical. Keep the proposal intro unchanged unless necessary.'
        : 'Draft proposal intro, terms, exclusions, and clarifications. Improve readability while preserving practical construction assumptions, and keep each field concise.',
    '',
    `Project Name: ${input.project.projectName}`,
    `Client: ${input.project.clientName || ''}`,
    `Address: ${input.project.address || ''}`,
    `Pricing Mode: ${input.project.pricingMode || 'labor_and_material'}`,
    `Base Bid Total: ${input.summary?.baseBidTotal || 0}`,
    `Total Labor Hours: ${input.summary?.totalLaborHours || 0}`,
    `Duration Days: ${input.summary?.durationDays || 0}`,
    assumptions.length ? `Project Assumptions: ${assumptions.join('; ')}` : 'Project Assumptions: none stated',
    `Current Proposal Intro: ${asText(input.settings?.proposalIntro)}`,
    `Current Proposal Terms: ${asText(input.settings?.proposalTerms)}`,
    `Current Proposal Exclusions: ${asText(input.settings?.proposalExclusions)}`,
    `Current Proposal Clarifications: ${asText(input.settings?.proposalClarifications)}`,
    `Current Acceptance Label: ${asText(input.settings?.proposalAcceptanceLabel)}`,
    `Default Intro: ${DEFAULT_PROPOSAL_INTRO}`,
    `Default Terms: ${DEFAULT_PROPOSAL_TERMS}`,
    `Default Exclusions: ${DEFAULT_PROPOSAL_EXCLUSIONS}`,
    `Default Clarifications: ${DEFAULT_PROPOSAL_CLARIFICATIONS}`,
    `Default Acceptance Label: ${DEFAULT_PROPOSAL_ACCEPTANCE_LABEL}`,
    `Estimate Line Snapshot: ${JSON.stringify(summarizeLines(lines))}`,
  ].join('\n');

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          proposalIntro: { type: Type.STRING },
          proposalTerms: { type: Type.STRING },
          proposalExclusions: { type: Type.STRING },
          proposalClarifications: { type: Type.STRING },
          proposalAcceptanceLabel: { type: Type.STRING },
        },
      },
    },
  });

  let parsed: any = {};
  try {
    parsed = JSON.parse(response.text || '{}');
  } catch (_error) {
    parsed = {};
  }

  if (mode === 'scope_summary') {
    return {
      proposalIntro: asText(parsed.proposalIntro) || DEFAULT_PROPOSAL_INTRO,
    };
  }

  if (mode === 'terms_and_conditions') {
    return {
      proposalTerms: asText(parsed.proposalTerms) || DEFAULT_PROPOSAL_TERMS,
      proposalExclusions: asText(parsed.proposalExclusions) || DEFAULT_PROPOSAL_EXCLUSIONS,
      proposalClarifications: asText(parsed.proposalClarifications) || DEFAULT_PROPOSAL_CLARIFICATIONS,
    };
  }

  if (mode === 'default_short') {
    return {
      proposalIntro: asText(parsed.proposalIntro) || DEFAULT_PROPOSAL_INTRO,
      proposalTerms: asText(parsed.proposalTerms) || DEFAULT_PROPOSAL_TERMS,
      proposalExclusions: asText(parsed.proposalExclusions) || DEFAULT_PROPOSAL_EXCLUSIONS,
      proposalClarifications: asText(parsed.proposalClarifications) || DEFAULT_PROPOSAL_CLARIFICATIONS,
      proposalAcceptanceLabel: asText(parsed.proposalAcceptanceLabel) || DEFAULT_PROPOSAL_ACCEPTANCE_LABEL,
    };
  }

  return {
    proposalIntro: asText(parsed.proposalIntro) || DEFAULT_PROPOSAL_INTRO,
    proposalTerms: asText(parsed.proposalTerms) || DEFAULT_PROPOSAL_TERMS,
    proposalExclusions: asText(parsed.proposalExclusions) || DEFAULT_PROPOSAL_EXCLUSIONS,
    proposalClarifications: asText(parsed.proposalClarifications) || DEFAULT_PROPOSAL_CLARIFICATIONS,
    proposalAcceptanceLabel: asText(parsed.proposalAcceptanceLabel) || DEFAULT_PROPOSAL_ACCEPTANCE_LABEL,
  };
}