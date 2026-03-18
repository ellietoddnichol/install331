import { GoogleGenAI } from '@google/genai';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { IntakeProjectAssumption, IntakeProposalAssist } from '../../shared/types/intake.ts';
import { intakeGeminiResponseSchema, INTAKE_GEMINI_MODEL } from './structuredExtractionSchemas.ts';

export interface GeminiExtractionLine {
  roomArea: string;
  category: string;
  itemCode: string;
  itemName: string;
  description: string;
  quantity: number;
  unit: string;
  notes: string;
}

export interface GeminiExtractionResult {
  projectName: string;
  projectNumber: string;
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
        }))
        .filter((line: GeminiExtractionLine) => line.description || line.itemName)
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

  return {
    projectName: asText(value?.projectName),
    projectNumber: asText(value?.projectNumber),
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

export async function extractIntakeFromGemini(input: ExtractInput): Promise<GeminiExtractionResult> {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_GEMINI_API_KEY || '';
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY (or GOOGLE_GEMINI_API_KEY) is missing.');
  }

  const ai = new GoogleGenAI({ apiKey });

  const prompt = [
    'You are an estimator intake extraction engine.',
    'Extract project metadata and takeoff lines into strict JSON.',
    'Before emitting parsedLines, classify each source row or chunk as one of: project_metadata, header_row, section_header, actual_scope_line, or ignore.',
    'Only actual_scope_line content may appear in parsedLines.',
    'Project metadata rows must populate project fields and must never appear in parsedLines.',
    'Header rows such as room/category/item/description/quantity/unit/labor/material/notes define structure only and must never appear in parsedLines.',
    'Section headers such as Toilet Accessories, Visual Display Boards, or Wall Protection may inform category context but must never appear in parsedLines unless a real scoped item is present.',
    'Ignore repeated field names, bid/proposal labels, generic setup text, parser artifacts, and long raw text blobs when they are not actual scoped items.',
    'Focus on finding: project name, project number or bid package, client, general contractor, full address, bid date, proposal date, estimator, room or area names, category, item identity, quantity, and unit.',
    'When the source is messy, use semantic reasoning to cleanly group scope lines and separate metadata from actual takeoff content.',
    'Prioritize accurate extraction over guessing; if uncertain, leave blank and add a warning.',
    'Return schema fields exactly as requested.',
    'For spreadsheets: use provided normalized rows as source of truth and improve categorization/mapping only.',
    'When structured fields are present in the source, split them into roomArea, category, itemName, description, quantity, unit, notes, and labor/material flags instead of dumping whole rows into description.',
    'For PDFs/messy docs: infer room area, item, quantity, and unit when explicitly stated or strongly implied by schedules and scope tables; avoid junk records.',
    'Interpret common construction proposal and invitation-to-bid structures, including schedules, room finish legends, keyed notes, and bid package references.',
    'Extract assumptions and commercial clues when present, including pricing basis, tax, delivery, freight, shipment, bond, unload, site visit, clarifications, exclusions, and alternates.',
    'Produce a short proposal assist object with intro, scope summary, clarifications, and exclusions when the source contains enough context.',
    '',
    `Source Type: ${input.sourceType}`,
    `File Name: ${input.fileName}`,
    input.extractedText ? `Extracted Text Preview:\n${input.extractedText.slice(0, 14000)}` : '',
    input.normalizedRows?.length
      ? `Normalized Rows JSON (deterministic parse):\n${JSON.stringify(input.normalizedRows.slice(0, 500))}`
      : '',
    'If project-level metadata such as project name, bid package, bid date, client, or address is present, extract it cleanly.',
    'For structured spreadsheets, prefer the row/column structure over OCR-like interpretation.',
    'Do not invent room names. Only return rooms that are clearly present in the source.',
    'Do not invent assumptions that are not present or strongly implied by the source.',
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

    return addQualityWarnings(sanitizeResult(parsed), input);
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
