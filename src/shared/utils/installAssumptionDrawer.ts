import type { PricingMode, ProjectRecord, TakeoffLineRecord } from '../types/estimator';
import { deriveInstallAssumptionGateUi } from './installIntelligenceLineUi.ts';
import {
  parseLineInstallAssumptionsFromNotes,
} from './lineInstallAssumptions.ts';
import {
  type InstallBlockingStatus,
  readBlockingStatusFromStructuredAssumptions,
} from './projectBlockingAssumptions.ts';
import { classifyImportedEstimateLine } from './quoteImportResultSummary.ts';

export type InstallAssumptionFieldKey =
  | 'blocking_status'
  | 'wall_substrate'
  | 'mounting_style';

export interface InstallAssumptionDrawerField {
  key: InstallAssumptionFieldKey;
  label: string;
  kind: 'select' | 'text';
  options?: Array<{ value: string; label: string }>;
}

export interface InstallAssumptionDrawerModel {
  lineId: string;
  description: string;
  qty: number;
  unit: string;
  category: string | null;
  laborStatusLabel: string;
  laborPaused: boolean;
  pauseMessage: string;
  projectApplied: {
    wallSubstrate: string | null;
    blockingStatus: InstallBlockingStatus | '';
    occupiedBuilding: boolean;
    restrictedAccess: boolean;
  };
  lineAssumptions: Record<string, string>;
  editableFields: InstallAssumptionDrawerField[];
}

const BLOCKING_OPTIONS: Array<{ value: InstallBlockingStatus; label: string }> = [
  { value: 'included', label: 'Included' },
  { value: 'by_others', label: 'By others' },
  { value: 'unknown', label: 'Unknown' },
];

const WALL_SUBSTRATE_OPTIONS = [
  { value: 'gypsum', label: 'Drywall / gypsum' },
  { value: 'tile', label: 'Tile' },
  { value: 'cmu', label: 'CMU / block' },
  { value: 'concrete', label: 'Concrete' },
  { value: 'metal', label: 'Metal panels' },
  { value: 'other', label: 'Other' },
];

function questionToFieldKey(question: string): InstallAssumptionFieldKey | null {
  const q = question.toLowerCase();
  if (/blocking|backing/.test(q)) return 'blocking_status';
  if (/substrate|wall type/.test(q)) return 'wall_substrate';
  if (/mounting/.test(q)) return 'mounting_style';
  return null;
}

function fieldDefinition(key: InstallAssumptionFieldKey): InstallAssumptionDrawerField {
  if (key === 'blocking_status') {
    return {
      key,
      label: 'Blocking / backing',
      kind: 'select',
      options: BLOCKING_OPTIONS.map((o) => ({ value: o.value, label: o.label })),
    };
  }
  if (key === 'wall_substrate') {
    return {
      key,
      label: 'Wall substrate',
      kind: 'select',
      options: WALL_SUBSTRATE_OPTIONS,
    };
  }
  return {
    key: 'mounting_style',
    label: 'Mounting style',
    kind: 'text',
  };
}

export function projectWallSubstrateToInstallValue(wallSubstrate: string | null | undefined): string {
  const raw = String(wallSubstrate || '').trim().toLowerCase();
  if (!raw) return '';
  if (raw.includes('tile')) return 'tile';
  if (raw.includes('drywall') || raw.includes('gypsum')) return 'gypsum';
  if (raw.includes('cmu') || raw.includes('block')) return 'cmu';
  if (raw.includes('concrete')) return 'concrete';
  if (raw.includes('metal')) return 'metal';
  return 'other';
}

export function buildInstallAssumptionDrawerModel(
  line: TakeoffLineRecord,
  project: Pick<ProjectRecord, 'wallSubstrate' | 'structuredAssumptions' | 'jobConditions'>,
  pricingMode: PricingMode = 'labor_and_material',
): InstallAssumptionDrawerModel {
  const gate = deriveInstallAssumptionGateUi(line, pricingMode);
  const classified = classifyImportedEstimateLine(line, pricingMode, project);
  const lineAssumptions = parseLineInstallAssumptionsFromNotes(line.notes);
  const projectBlocking = readBlockingStatusFromStructuredAssumptions(project.structuredAssumptions) ?? '';

  const fieldKeys = new Set<InstallAssumptionFieldKey>();
  for (const question of gate.detail.requiredQuestions) {
    const key = questionToFieldKey(question);
    if (key) fieldKeys.add(key);
  }
  if (gate.isGated && gate.detail.requiredQuestions.some((q) => /blocking/i.test(q))) {
    fieldKeys.add('blocking_status');
  }
  if (gate.isGated && gate.detail.requiredQuestions.some((q) => /substrate/i.test(q))) {
    fieldKeys.add('wall_substrate');
  }
  if (/partition/i.test(`${line.category || ''} ${line.description}`)) {
    if (gate.detail.requiredQuestions.some((q) => /mounting/i.test(q))) {
      fieldKeys.add('mounting_style');
    }
  }

  if (fieldKeys.size === 0 && gate.isGated) {
    fieldKeys.add('blocking_status');
  }

  const pauseMessage =
    gate.isGated
      ? (classified.reason || 'Labor is paused until install assumptions are confirmed.')
      : 'Install assumptions are satisfied for this line.';

  return {
    lineId: line.id,
    description: line.description,
    qty: Number(line.qty) || 1,
    unit: line.unit || 'EA',
    category: line.category,
    laborStatusLabel: classified.laborStatusLabel,
    laborPaused: gate.isGated,
    pauseMessage,
    projectApplied: {
      wallSubstrate: project.wallSubstrate,
      blockingStatus: projectBlocking,
      occupiedBuilding: Boolean(project.jobConditions?.occupiedBuilding),
      restrictedAccess: Boolean(project.jobConditions?.restrictedAccess),
    },
    lineAssumptions,
    editableFields: Array.from(fieldKeys).map(fieldDefinition),
  };
}

export function mergeDraftInstallAssumptions(
  model: InstallAssumptionDrawerModel,
  draft: Record<string, string>,
): Record<string, string> {
  const next = { ...model.lineAssumptions };
  for (const field of model.editableFields) {
    const value = String(draft[field.key] || '').trim();
    if (value) next[field.key] = value;
    else delete next[field.key];
  }
  return next;
}
