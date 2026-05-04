import type { IntakeParseRequest, IntakeParseResult } from '../../shared/types/intake.ts';
import { listActiveCatalogItems } from '../repos/catalogRepo.ts';
import { listModifiers } from '../repos/modifiersRepo.ts';
import { enrichParseResultWithDiv10Brain } from './div10BrainIntakeEnrichment.ts';
import { parseUploadedWithRouter } from './uploadRouter.ts';

export async function parseUploadedIntake(input: IntakeParseRequest): Promise<IntakeParseResult> {
  const base = await parseUploadedWithRouter(input);
  const catalog = await listActiveCatalogItems();
  const modifiers = await listModifiers();
  return enrichParseResultWithDiv10Brain(base, catalog, modifiers);
}
