import { GoogleGenAI, Type } from '@google/genai';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';

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
  address: string;
  bidDate: string;
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

  return {
    projectName: asText(value?.projectName),
    projectNumber: asText(value?.projectNumber),
    client: asText(value?.client),
    address: asText(value?.address),
    bidDate: asText(value?.bidDate),
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
    'Prioritize accurate extraction over guessing; if uncertain, leave blank and add a warning.',
    'Return schema fields exactly as requested.',
    'For spreadsheets: use provided normalized rows as source of truth and improve categorization/mapping only.',
    'For PDFs/messy docs: infer room area, item, quantity, and unit when explicitly stated; avoid junk records.',
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
  ]
    .filter(Boolean)
    .join('\n');

  const parts: any[] = [{ text: prompt }];

  let tempFilePath: string | null = null;
  try {
    if (input.sourceType === 'pdf' && input.dataBase64 && input.mimeType.toLowerCase().includes('pdf')) {
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
    }

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [{ role: 'user', parts }],
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            projectName: { type: Type.STRING },
            projectNumber: { type: Type.STRING },
            client: { type: Type.STRING },
            address: { type: Type.STRING },
            bidDate: { type: Type.STRING },
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
          required: ['projectName', 'projectNumber', 'client', 'address', 'bidDate', 'rooms', 'parsedLines'],
        },
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
