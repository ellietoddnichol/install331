import type { ProjectRecord, SettingsRecord } from '../../shared/types/estimator';
import { createDefaultProjectJobConditions } from '../../shared/utils/jobConditions';

export function newIntakeProjectDraftId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return `draft-${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
}

export function createInitialProjectDraft(settings?: SettingsRecord | null): Partial<ProjectRecord> {
  return {
    id: newIntakeProjectDraftId(),
    projectName: '',
    projectNumber: '',
    projectNumberSource: 'auto',
    clientName: '',
    generalContractor: '',
    estimator: '',
    address: '',
    proposalDate: '',
    projectType: 'Commercial',
    projectSize: 'T3_standard',
    floorLevel: 'Ground',
    accessDifficulty: 'Easy',
    installHeight: 'Standard',
    materialHandling: 'Standard',
    wallSubstrate: 'Drywall',
    laborBurdenPercent: settings?.defaultLaborBurdenPercent ?? 0,
    overheadPercent: settings?.defaultOverheadPercent ?? 15,
    profitPercent: 0,
    laborOverheadPercent: settings?.defaultLaborOverheadPercent ?? 5,
    laborProfitPercent: 0,
    subLaborManagementFeeEnabled: false,
    subLaborManagementFeePercent: 5,
    taxPercent: settings?.defaultTaxPercent ?? 8.25,
    pricingMode: 'labor_and_material',
    selectedScopeCategories: [],
    bidDate: '',
    dueDate: '',
    notes: '',
    specialNotes: '',
    jobConditions: createDefaultProjectJobConditions(),
  };
}
