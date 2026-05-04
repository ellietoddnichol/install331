import { Type } from '@google/genai';

export const INTAKE_GEMINI_MODEL = process.env.INTAKE_GEMINI_MODEL || process.env.GEMINI_MODEL || 'gemini-2.5-flash';

export const intakeGeminiResponseSchema = {
  type: Type.OBJECT,
  properties: {
    documentType: {
      type: Type.STRING,
      description:
        'One of: takeoff, finish_schedule, spec_excerpt, proposal, quote_request, addendum, general_notes, unknown',
    },
    documentRationale: { type: Type.STRING },
    documentConfidence: { type: Type.NUMBER },
    documentEvidence: { type: Type.STRING },
    suggestedGlobalModifiers: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          phrase: { type: Type.STRING },
          confidence: { type: Type.NUMBER },
          rationale: { type: Type.STRING },
          evidenceText: { type: Type.STRING },
        },
        required: ['phrase'],
      },
    },
    requiresGrounding: { type: Type.ARRAY, items: { type: Type.STRING } },
    projectName: { type: Type.STRING },
    projectNumber: { type: Type.STRING },
    bidPackage: { type: Type.STRING },
    client: { type: Type.STRING },
    generalContractor: { type: Type.STRING },
    address: { type: Type.STRING },
    bidDate: { type: Type.STRING },
    proposalDate: { type: Type.STRING },
    estimator: { type: Type.STRING },
    pricingBasis: { type: Type.STRING },
    assumptions: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          kind: { type: Type.STRING },
          text: { type: Type.STRING },
          confidence: { type: Type.NUMBER },
        },
        required: ['kind', 'text'],
      },
    },
    proposalAssist: {
      type: Type.OBJECT,
      properties: {
        introDraft: { type: Type.STRING },
        scopeSummaryDraft: { type: Type.STRING },
        clarificationsDraft: { type: Type.STRING },
        exclusionsDraft: { type: Type.STRING },
      },
    },
    rooms: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
    },
    parsedLines: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          roomArea: { type: Type.STRING },
          category: { type: Type.STRING },
          itemCode: { type: Type.STRING },
          itemName: { type: Type.STRING },
          description: { type: Type.STRING },
          quantity: { type: Type.NUMBER },
          unit: { type: Type.STRING },
          notes: { type: Type.STRING },
          fieldAssembly: { type: Type.BOOLEAN },
          lineKind: { type: Type.STRING },
          documentLineKind: {
            type: Type.STRING,
            description:
              'item, bundle_candidate, modifier_candidate, job_condition, exclusion, clarification, allowance, deduction, freight_delivery, demo, labor_note, material_note, informational_only, unknown',
          },
          pricingRole: {
            type: Type.STRING,
            description:
              'base_material, base_install, optional_adder, global_adder, line_modifier, deduction, informational_only, unknown',
          },
          scopeTarget: { type: Type.STRING, description: 'line, room, project, or unknown' },
          costDriver: { type: Type.STRING, description: 'material, labor, both, none, unknown' },
          applicationMethod: {
            type: Type.STRING,
            description: 'attach_to_item, apply_globally, info_only, unknown',
          },
          lineConfidence: { type: Type.NUMBER },
          rationale: { type: Type.STRING },
          evidenceText: { type: Type.STRING },
          requiresGroundingLine: { type: Type.BOOLEAN },
          parserBlockType: {
            type: Type.STRING,
            description:
              'Document block classification: company_header, proposal_metadata, scope_header, scope_item, scope_option, subtotal, commercial_term, inclusion_note, unknown',
          },
          extractionBucket: {
            type: Type.STRING,
            description:
              'scope | commercial_term | alternate | assumption_signal | exclusion | hidden_scope_signal | unknown — commercial_term/assumption_signal rows must not appear in parsedLines; use assumptions instead',
          },
        },
        required: ['description', 'quantity', 'unit'],
      },
    },
    warnings: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
    },
  },
  required: ['projectName', 'projectNumber', 'client', 'generalContractor', 'address', 'bidDate', 'proposalDate', 'estimator', 'pricingBasis', 'assumptions', 'proposalAssist', 'rooms', 'parsedLines'],
} as const;
