import { GoogleGenAI } from '@google/genai';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import type { IntakeProjectAssumption, IntakeProposalAssist } from '../../shared/types/intake.ts';
import { isPlausibleProjectTitle, looksLikeIntakePricingSummaryOrDisclaimerLine } from '../../shared/utils/intakeTextGuards.ts';
import { intakeGeminiResponseSchema, INTAKE_GEMINI_MODEL } from './structuredExtractionSchemas.ts';
import { extractIntakeMetadataHintsFromText, mergeNlpHintsIntoPartialMetadata } from './naturalLanguageService.ts';
import {
  enrichSiteAddressWithMapsGrounding,
  isMapsGroundingEnabled,
  shouldAttemptMapsGroundingForAddress,
} from './mapsGroundingLiteService.ts';

export interface GeminiExtractionLine {
  roomArea: string;
  category: string;
  itemCode: string;
  itemName: string;
  description: string;
  quantity: number;
  unit: string;
  notes: string;
  /** When true, line calls out on-site / field assembly (KD, RTA, assemble on site). */
  fieldAssembly?: boolean;
  /** item | modifier | bundle — scope adders vs primary lines when obvious. */
  lineKind?: string;
  documentLineKind?: string;
  pricingRole?: string;
  scopeTarget?: string;
  costDriver?: string;
  applicationMethod?: string;
  lineConfidence?: number;
  rationale?: string;
  evidenceText?: string;
  requiresGroundingLine?: boolean;
}

export interface GeminiExtractionResult {
  projectName: string;
  projectNumber: string;
  bidPackage: string;
  client: string;
  generalContractor: string;
  address: string;
  bidDate: string;
  proposalDate: string;
  estimator: string;
  pricingBasis: '' | 'material_only' | 'labor_only' | 'labor_and_material';
  assumptions: IntakeProjectAssumption[];
  proposalAssist: IntakeProposalAssist;
  rooms: string[];
  parsedLines: GeminiExtractionLine[];
  warnings: string[];
  documentType?: string;
  documentRationale?: string;
  documentConfidence?: number;
  documentEvidence?: string;
  suggestedGlobalModifiers?: Array<{
    phrase: string;
    confidence: number;
    rationale: string;
    evidenceText: string;
  }>;
  requiresGrounding?: string[];
}

interface ExtractInput {
  fileName: string;
  mimeType: string;
  dataBase64?: string;
  sourceType: 'pdf' | 'document' | 'spreadsheet';
  extractedText?: string;
  normalizedRows?: Array<Record<string, unknown>>;
}

function asText(value: unknown): string {
  return String(value ?? '').trim();
}

function asNumber(value: unknown, fallback = 1): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function sanitizeResult(value: any): GeminiExtractionResult {
  const parsedLines = Array.isArray(value?.parsedLines)
    ? value.parsedLines
        .map((line: any) => ({
          roomArea: asText(line?.roomArea),
          category: asText(line?.category),
          itemCode: asText(line?.itemCode),
          itemName: asText(line?.itemName),
          description: asText(line?.description),
          quantity: asNumber(line?.quantity, 1),
          unit: asText(line?.unit) || 'EA',
          notes: asText(line?.notes),
          fieldAssembly: Boolean(line?.fieldAssembly),
          lineKind: asText(line?.lineKind).toLowerCase(),
          documentLineKind: asText(line?.documentLineKind).toLowerCase(),
          pricingRole: asText(line?.pricingRole).toLowerCase(),
          scopeTarget: asText(line?.scopeTarget).toLowerCase(),
          costDriver: asText(line?.costDriver).toLowerCase(),
          applicationMethod: asText(line?.applicationMethod).toLowerCase(),
          lineConfidence: Number.isFinite(Number(line?.lineConfidence))
            ? Math.max(0, Math.min(1, Number(line.lineConfidence)))
            : undefined,
          rationale: asText(line?.rationale),
          evidenceText: asText(line?.evidenceText),
          requiresGroundingLine: Boolean(line?.requiresGroundingLine),
        }))
        .filter((line: GeminiExtractionLine) => line.description || line.itemName)
        .filter((line: GeminiExtractionLine) => {
          const id = `${line.itemName} ${line.description}`.trim();
          return !looksLikeIntakePricingSummaryOrDisclaimerLine(id);
        })
    : [];

  const rooms = Array.isArray(value?.rooms)
    ? value.rooms.map((room: unknown) => asText(room)).filter(Boolean)
    : [];

  const assumptions = Array.isArray(value?.assumptions)
    ? value.assumptions
        .map((assumption: any) => ({
          kind: String(assumption?.kind || 'other').trim() as IntakeProjectAssumption['kind'],
          text: asText(assumption?.text),
          confidence: Number.isFinite(Number(assumption?.confidence)) ? Math.max(0, Math.min(1, Number(assumption.confidence))) : 0.5,
        }))
        .filter((assumption: IntakeProjectAssumption) => assumption.text)
    : [];

  const proposalAssist: IntakeProposalAssist = {
    introDraft: asText(value?.proposalAssist?.introDraft),
    scopeSummaryDraft: asText(value?.proposalAssist?.scopeSummaryDraft),
    clarificationsDraft: asText(value?.proposalAssist?.clarificationsDraft),
    exclusionsDraft: asText(value?.proposalAssist?.exclusionsDraft),
  };

  const pricingBasis = asText(value?.pricingBasis).toLowerCase();

  const rawProjectName = asText(value?.projectName);

  const suggestedGlobalModifiers = Array.isArray(value?.suggestedGlobalModifiers)
    ? value.suggestedGlobalModifiers
        .map((entry: any) => ({
          phrase: asText(entry?.phrase),
          confidence: Number.isFinite(Number(entry?.confidence)) ? Math.max(0, Math.min(1, Number(entry.confidence))) : 0.5,
          rationale: asText(entry?.rationale),
          evidenceText: asText(entry?.evidenceText),
        }))
        .filter((entry: { phrase: string }) => entry.phrase)
    : [];

  const requiresGrounding = Array.isArray(value?.requiresGrounding)
    ? value.requiresGrounding.map((g: unknown) => asText(g)).filter(Boolean)
    : [];

  const documentConfidenceRaw = Number(value?.documentConfidence);
  const documentConfidence = Number.isFinite(documentConfidenceRaw) ? Math.max(0, Math.min(1, documentConfidenceRaw)) : 0;

  return {
    projectName: isPlausibleProjectTitle(rawProjectName) ? rawProjectName : '',
    projectNumber: asText(value?.projectNumber),
    bidPackage: asText(value?.bidPackage),
    client: asText(value?.client),
    generalContractor: asText(value?.generalContractor),
    address: asText(value?.address),
    bidDate: asText(value?.bidDate),
    proposalDate: asText(value?.proposalDate),
    estimator: asText(value?.estimator),
    pricingBasis: pricingBasis === 'material_only' || pricingBasis === 'labor_only' || pricingBasis === 'labor_and_material'
      ? pricingBasis as GeminiExtractionResult['pricingBasis']
      : '',
    assumptions,
    proposalAssist,
    rooms,
    parsedLines,
    warnings: Array.isArray(value?.warnings) ? value.warnings.map((warning: unknown) => asText(warning)).filter(Boolean) : [],
    documentType: asText(value?.documentType).toLowerCase(),
    documentRationale: asText(value?.documentRationale),
    documentConfidence,
    documentEvidence: asText(value?.documentEvidence),
    suggestedGlobalModifiers,
    requiresGrounding,
  };
}

function addQualityWarnings(result: GeminiExtractionResult, input: ExtractInput): GeminiExtractionResult {
  const warnings = [...result.warnings];

  if (result.parsedLines.length === 0) {
    warnings.push('No structured lines were extracted.');
  }

  const incompleteLineCount = result.parsedLines.filter((line) => {
    const hasIdentity = Boolean(asText(line.itemName) || asText(line.description));
    const hasQty = Number.isFinite(Number(line.quantity)) && Number(line.quantity) > 0;
    return !(hasIdentity && hasQty);
  }).length;

  if (incompleteLineCount > 0) {
    warnings.push(`${incompleteLineCount} extracted line(s) are incomplete.`);
  }

  if ((input.sourceType === 'pdf' || input.sourceType === 'document') && result.parsedLines.length < 2) {
    warnings.push('Extraction may be incomplete for this document; review raw lines before creating records.');
  }

  return {
    ...result,
    warnings: Array.from(new Set(warnings)),
  };
}

async function enrichGeminiResultWithNaturalLanguage(
  result: GeminiExtractionResult,
  input: ExtractInput
): Promise<GeminiExtractionResult> {
  const text = input.extractedText?.trim() || '';
  if (text.length < 40) return result;

  const hints = await extractIntakeMetadataHintsFromText(text);
  if (!hints.client?.trim() && !hints.generalContractor?.trim() && !hints.address?.trim()) {
    return result;
  }

  const merged = mergeNlpHintsIntoPartialMetadata(
    {
      client: result.client,
      generalContractor: result.generalContractor,
      address: result.address,
    },
    hints
  );

  return {
    ...result,
    client: merged.client ?? result.client,
    generalContractor: merged.generalContractor ?? result.generalContractor,
    address: merged.address ?? result.address,
  };
}

async function enrichGeminiResultWithMapsGrounding(
  result: GeminiExtractionResult,
  input: ExtractInput
): Promise<GeminiExtractionResult> {
  const text = input.extractedText?.trim() || '';
  if (text.length < 40 || !isMapsGroundingEnabled()) return result;
  if (!shouldAttemptMapsGroundingForAddress(result.address)) return result;

  const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_GEMINI_API_KEY || '';
  if (!geminiKey) return result;

  const enriched = await enrichSiteAddressWithMapsGrounding({
    geminiApiKey: geminiKey,
    contextText: text,
    hintAddress: result.address,
  });
  if (!enriched?.addressLine?.trim()) return result;

  const warnings = [...result.warnings];
  if (enriched.placeUrl) {
    warnings.push(`Google Maps source (show attribution near address): ${enriched.placeUrl}`);
  }

  return {
    ...result,
    address: enriched.addressLine,
    warnings: Array.from(new Set(warnings)),
  };
}

export async function extractIntakeFromGemini(input: ExtractInput): Promise<GeminiExtractionResult> {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_GEMINI_API_KEY || '';
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY (or GOOGLE_GEMINI_API_KEY) is missing.');
  }

  const ai = new GoogleGenAI({ apiKey });

  const prompt = [
    'You are an estimator intake extraction engine.',
    'You are provided with the raw PDF file natively. Prioritize your visual understanding of the tables, matrices, and schedules in the PDF file over any provided text representations.',
    'Extract project metadata and takeoff lines into strict JSON.',
    'Before emitting parsedLines, classify each source row or chunk as one of: project_metadata, header_row, section_header, actual_scope_line, or ignore.',
    'Only actual_scope_line content may appear in parsedLines.',
    'Merge sentence fragments into a single parsedLines row per distinct scope or schedule line; do not emit one row per short phrase.',
    'Project metadata rows must populate project fields and must never appear in parsedLines.',
    'Header rows such as room/category/item/description/quantity/unit/labor/material/notes define structure only and must never appear in parsedLines.',
    'Section headers such as Toilet Accessories, Visual Display Boards, or Wall Protection may inform category context but must never appear in parsedLines unless a real scoped item is present.',
    'Ignore repeated field names, bid/proposal labels, generic setup text, parser artifacts, and long raw text blobs when they are not actual scoped items.',
    'Never emit as parsedLines: lump-sum lines like "Material: $1234" or "Labor: $500", grand totals, or disclaimers such as "IF LABOR IS NEEDED PLEASE CALL FOR QUOTE" — those belong in assumptions or nowhere.',
    'Focus on finding: project name, project number or bid package, client, general contractor, full address, bid date, proposal date, estimator, room or area names, category, item identity, quantity, and unit.',
    'When the source is messy, use semantic reasoning to cleanly group scope lines and separate metadata from actual takeoff content.',
    'Prioritize accurate extraction over guessing; if uncertain, leave blank and add a warning.',
    'Return schema fields exactly as requested.',
    'For spreadsheets: use provided normalized rows as source of truth and improve categorization/mapping only.',
    'When structured fields are present in the source, split them into roomArea, category, itemName, description, quantity, unit, notes, and labor/material flags instead of dumping whole rows into description.',
    'For PDFs/messy docs: infer room area, item, quantity, and unit when explicitly stated or strongly implied by schedules and scope tables; avoid junk records.',
    'Interpret common construction proposal and invitation-to-bid structures, including schedules, room finish legends, keyed notes, and bid package references.',
    'Classify parsedLines rows: primary scope quantities (lineKind item), finish/adder/deduct lines (lineKind modifier), or grouped accessory packages (lineKind bundle).',
    'Set fieldAssembly true when the line states KD, RTA, knock-down, or that fixtures (e.g. lockers, benches) must be assembled on site — those are still scope items, not modifiers.',
    'Do not set lineKind modifier for a product line whose only special need is field assembly; use fieldAssembly true and lineKind item instead.',
    'Extract assumptions and commercial clues when present, including pricing basis, tax, delivery, freight, shipment, bond, unload, site visit, clarifications, exclusions, and alternates.',
    'Produce a short proposal assist object with intro, scope summary, clarifications, and exclusions when the source contains enough context.',
    '',
    `Source Type: ${input.sourceType}`,
    `File Name: ${input.fileName}`,
    'Return bidPackage when the document identifies a bid package or package number separately from the project number.',
    input.extractedText ? `Fallback Extracted Text (may contain OCR errors, rely on the raw file first):\n${input.extractedText.slice(0, 14000)}` : '',
    input.normalizedRows?.length
      ? `Normalized Rows JSON (deterministic parse):\n${JSON.stringify(input.normalizedRows.slice(0, 500))}`
      : '',
    'If project-level metadata such as project name, bid package, bid date, client, or address is present, extract it cleanly.',
    'For structured spreadsheets, prefer the row/column structure over OCR-like interpretation.',
    'Do not invent room names. Only return rooms that are clearly present in the source.',
    'Do not invent assumptions that are not present or strongly implied by the source.',
    '',
    'Ontology pass (same JSON response): set documentType to one of: takeoff, finish_schedule, spec_excerpt, proposal, quote_request, addendum, general_notes, unknown.',
    'Set documentRationale (short), documentConfidence (0-1), and documentEvidence (short quote from source) when you can justify documentType.',
    'For each parsedLines row, when possible set: documentLineKind (item, modifier_candidate, bundle_candidate, exclusion, clarification, allowance, deduction, freight_delivery, demo, labor_note, material_note, informational_only, unknown),',
    'pricingRole (base_material, base_install, optional_adder, global_adder, line_modifier, deduction, informational_only, unknown), scopeTarget (line, room, project, unknown), costDriver (material, labor, both, none, unknown),',
    'applicationMethod (attach_to_item, apply_globally, info_only, unknown), lineConfidence (0-1), rationale (one sentence), evidenceText (short quote), requiresGroundingLine (true only if part numbers/spec language needs web lookup).',
    'suggestedGlobalModifiers: array of { phrase, confidence, rationale, evidenceText } for project-wide conditions implied by the doc (night work, occupied building, prevailing wage, delivery, demo, etc.) — phrases only, not dollar amounts.',
    'requiresGrounding: string array of reasons the model needs external verification (ambiguous manufacturer, unfamiliar spec section, etc.). Leave empty when not needed.',
  ]
    .filter(Boolean)
    .join('\n');

  const parts: any[] = [{ text: prompt }];

  let tempFilePath: string | null = null;
  try {
    if (input.dataBase64 && input.mimeType) {
      if (input.sourceType === 'pdf' && input.mimeType.toLowerCase().includes('pdf')) {
      const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gemini-intake-'));
      tempFilePath = path.join(tmpDir, input.fileName || 'upload.pdf');
      await fs.writeFile(tempFilePath, Buffer.from(input.dataBase64, 'base64'));

      const uploaded = await ai.files.upload({
        file: tempFilePath,
        config: {
          mimeType: input.mimeType,
          displayName: input.fileName,
        },
      });

      if (uploaded.uri) {
        parts.push({
          fileData: {
            mimeType: input.mimeType,
            fileUri: uploaded.uri,
          },
        });
      }
      } else {
        parts.push({
          inlineData: {
            mimeType: input.mimeType,
            data: input.dataBase64,
          },
        });
      }
    }

    const response = await ai.models.generateContent({
      model: INTAKE_GEMINI_MODEL,
      contents: [{ role: 'user', parts }],
      config: {
        responseMimeType: 'application/json',
        responseSchema: intakeGeminiResponseSchema,
      },
    });

    let parsed: any = {};
    try {
      parsed = JSON.parse(response.text || '{}');
    } catch (_error) {
      parsed = {};
    }

    const base = addQualityWarnings(sanitizeResult(parsed), input);
    const withNlp = await enrichGeminiResultWithNaturalLanguage(base, input);
    return enrichGeminiResultWithMapsGrounding(withNlp, input);
  } finally {
    if (tempFilePath) {
      try {
        await fs.unlink(tempFilePath);
        await fs.rmdir(path.dirname(tempFilePath));
      } catch (_error) {
        // ignore temp cleanup errors
      }
    }
  }
}
