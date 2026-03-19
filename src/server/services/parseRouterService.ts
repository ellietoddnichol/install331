import type { IntakeParseRequest, IntakeParseResult } from '../../shared/types/intake.ts';
import { parseUploadedWithRouter } from './uploadRouter.ts';

export async function parseUploadedIntake(input: IntakeParseRequest): Promise<IntakeParseResult> {
  return parseUploadedWithRouter(input);
}
