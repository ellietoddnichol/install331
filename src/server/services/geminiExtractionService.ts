import type { GeminiExtractionResult } from './geminiIntakeExtraction.ts';
import { extractIntakeFromGemini } from './geminiIntakeExtraction.ts';

export async function extractIntakeWithGemini(input: Parameters<typeof extractIntakeFromGemini>[0]): Promise<GeminiExtractionResult> {
  return extractIntakeFromGemini(input);
}

export async function extractSpreadsheetWithGemini(input: Parameters<typeof extractIntakeFromGemini>[0]): Promise<GeminiExtractionResult> {
  return extractIntakeFromGemini({ ...input, sourceType: 'spreadsheet' });
}

export async function extractDocumentWithGemini(input: Parameters<typeof extractIntakeFromGemini>[0]): Promise<GeminiExtractionResult> {
  return extractIntakeFromGemini(input);
}