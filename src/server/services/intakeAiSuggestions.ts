import type { IntakeAiLineClassification, IntakeAiProjectModifierHint, IntakeAiSuggestions } from '../../shared/types/intake.ts';
import type { GeminiExtractionResult } from './geminiIntakeExtraction.ts';

function previewDescription(text: string, max = 72): string {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

/**
 * Maps Gemini extended ontology fields into the intake API shape for review UI.
 * Does not validate against catalog/modifiers DB — that belongs in a later pass.
 */
export function buildIntakeAiSuggestionsFromGemini(gemini: GeminiExtractionResult): IntakeAiSuggestions | undefined {
  const globals: IntakeAiProjectModifierHint[] = (gemini.suggestedGlobalModifiers || []).map((g) => ({
    phrase: g.phrase,
    confidence: g.confidence,
    rationale: g.rationale,
    evidenceText: g.evidenceText,
  }));

  const lineClassifications: IntakeAiLineClassification[] = gemini.parsedLines
    .map((line, lineIndex) => ({
      lineIndex,
      descriptionPreview: previewDescription(line.description || line.itemName),
      documentLineKind: line.documentLineKind || '',
      pricingRole: line.pricingRole || '',
      scopeTarget: line.scopeTarget || '',
      costDriver: line.costDriver || '',
      applicationMethod: line.applicationMethod || '',
      lineConfidence: line.lineConfidence ?? 0,
      rationale: line.rationale || '',
      evidenceText: line.evidenceText || '',
      requiresGrounding: Boolean(line.requiresGroundingLine),
      lineKindLegacy: line.lineKind || '',
    }))
    .filter(
      (row) =>
        Boolean(row.documentLineKind) ||
        Boolean(row.pricingRole) ||
        Boolean(row.rationale) ||
        Boolean(row.evidenceText) ||
        row.requiresGrounding ||
        row.lineConfidence > 0
    );

  const hasDocSignal =
    Boolean(gemini.documentType) ||
    Boolean(gemini.documentRationale) ||
    Boolean(gemini.documentEvidence) ||
    gemini.documentConfidence > 0;
  const hasGlobals = globals.length > 0;
  const hasGrounding = (gemini.requiresGrounding || []).length > 0;
  const hasLineSignal = lineClassifications.length > 0;

  if (!hasDocSignal && !hasGlobals && !hasGrounding && !hasLineSignal) {
    return undefined;
  }

  const pb = gemini.pricingBasis;
  const pricingModeSuggested: IntakeAiSuggestions['pricingModeSuggested'] =
    pb === 'material_only' ||
    pb === 'labor_only' ||
    pb === 'labor_and_material' ||
    pb === 'material_with_optional_install_quote'
      ? pb
      : '';

  return {
    documentType: gemini.documentType || 'unknown',
    pricingModeSuggested,
    documentConfidence: gemini.documentConfidence ?? 0,
    documentRationale: gemini.documentRationale || '',
    documentEvidence: gemini.documentEvidence || '',
    suggestedProjectModifierHints: globals,
    requiresGrounding: gemini.requiresGrounding || [],
    lineClassifications,
  };
}
