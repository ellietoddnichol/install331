type GeminiSummaryMode = 'customer_proposal' | 'install_review';

interface GeminiSummaryPromptInput {
  mode: GeminiSummaryMode;
  projectName: string;
  clientName?: string;
  location?: string;
  bidDate?: string;
  crewSize?: number | string;
  totalLaborHours?: number | string;
  totalDays?: number | string;
  materialTotal?: number | string;
  laborTotal?: number | string;
  proposalTotal?: number | string;
  assumptions?: string[];
  scopeLines?: string[];
  specialNotes?: string[];
}

function formatList(items: string[] | undefined, fallback: string): string {
  const normalized = (items || []).map((item) => String(item || '').trim()).filter(Boolean);
  return normalized.length ? JSON.stringify(normalized) : fallback;
}

export function buildGeminiSummaryPrompt(input: GeminiSummaryPromptInput): string {
  const contextBlock = [
    `Project: ${input.projectName || 'Untitled project'}`,
    `Client: ${input.clientName || ''}`,
    `Location: ${input.location || 'Location TBD'}`,
    `Bid Due Date: ${input.bidDate || 'Not provided'}`,
    `Crew Size: ${input.crewSize ?? 'TBD'}`,
    `Estimated Install Hours: ${input.totalLaborHours ?? 0}`,
    `Estimated Days On Site: ${input.totalDays ?? 0}`,
    `Material Total: ${input.materialTotal ?? 0}`,
    `Labor Total: ${input.laborTotal ?? 0}`,
    `Proposal Total: ${input.proposalTotal ?? 0}`,
    `Project Assumptions: ${formatList(input.assumptions, 'none stated')}`,
    `Scope Summary: ${formatList(input.scopeLines, '[]')}`,
    `Special Notes: ${formatList(input.specialNotes, '[]')}`,
  ];

  if (input.mode === 'install_review') {
    return [
      'You are preparing an internal install estimator summary.',
      'Write concise operations bullets only.',
      'Do not use sales language.',
      'Do not mention union wage as an optional adder.',
      'Call out crew sizing, schedule realism, risk, and missing scope checks.',
      'If uncertain, tell the reviewer to verify in field.',
      ...contextBlock,
      'Return JSON only with:',
      '- considerations: 4 to 6 concise install-risk bullets',
      '- reviewQuestions: 5 concise install-review questions',
    ].join('\n');
  }

  return [
    'You are a construction proposal writing assistant.',
    'Write concise, professional customer-facing proposal text.',
    'Keep language short and scannable.',
    'Do not invent scope not supported by the input.',
    'Do not include internal-only install coordination commentary.',
    ...contextBlock,
    'Return JSON only with:',
    '- proposalIntro',
    '- proposalTerms',
    '- proposalExclusions',
    '- proposalClarifications',
    '- proposalAcceptanceLabel',
  ].join('\n');
}
