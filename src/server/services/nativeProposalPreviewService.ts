import type { EstimateSummary, ProjectRecord, TakeoffLineRecord } from '../../shared/types/estimator.ts';
import { listRooms } from '../repos/roomsRepo.ts';
import * as pe from '../repos/native/nativeEstimatorPipelineRepo.ts';
import { collectNativeProposalContractWarnings } from './nativeProposalContract.ts';
import { mapCustomerEstimateLinesToTakeoffLike, resolveNativeProposalSummary } from './nativeProposalMapper.ts';

export type NativeProposalPreviewPayload = {
  lines: TakeoffLineRecord[];
  summary: EstimateSummary;
  warnings: string[];
};

export async function buildNativeProposalPreview(
  project: ProjectRecord,
  estimateId: string
): Promise<NativeProposalPreviewPayload> {
  const [customerRows, summaryRow, rooms] = await Promise.all([
    pe.queryEstimateLinesCustomer(estimateId),
    pe.queryEstimateSummary(estimateId),
    listRooms(project.id),
  ]);
  const defaultRoomId = rooms[0]?.id || 'native-proposal';
  const mappedLines = mapCustomerEstimateLinesToTakeoffLike(customerRows, project.id, defaultRoomId);
  const summary = await resolveNativeProposalSummary(project, summaryRow, mappedLines);
  const warnings = collectNativeProposalContractWarnings(customerRows, summaryRow, mappedLines, summary);
  return { lines: mappedLines, summary, warnings };
}
