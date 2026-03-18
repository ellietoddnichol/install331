import { IntakeParseRequest, IntakeParseResult } from '../../shared/types/intake.ts';
import { parseIntakeRequest } from './intakePipeline.ts';

export async function parseUploadedIntake(input: IntakeParseRequest): Promise<IntakeParseResult> {
  return parseIntakeRequest(input);
}
