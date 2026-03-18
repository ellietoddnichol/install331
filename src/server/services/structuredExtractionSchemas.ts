import { Type } from '@google/genai';

export const INTAKE_GEMINI_MODEL = 'gemini-2.5-flash';

export const intakeGeminiResponseSchema = {
  type: Type.OBJECT,
  properties: {
    projectName: { type: Type.STRING },
    projectNumber: { type: Type.STRING },
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
