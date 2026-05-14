import { randomUUID } from 'crypto';
import type { ProjectRecord } from '../../shared/types/estimator.ts';
import { SHEETS_TABS, readRows, upsertRowById, type SheetsRow } from '../integrations/googleSheets.ts';
import { assertSheetsWorkbookId, getProjectsSpreadsheetId } from './dataBackend.ts';

function projectsWorkbookId(): string {
  return assertSheetsWorkbookId(getProjectsSpreadsheetId(), 'GOOGLE_PROJECTS_SPREADSHEET_ID');
}

function parseNumber(value: string | undefined, fallback = 0): number {
  const n = Number(String(value || '').trim());
  return Number.isFinite(n) ? n : fallback;
}

function parseBoolean(value: string | undefined, fallback = false): boolean {
  const v = String(value || '').trim().toLowerCase();
  if (!v) return fallback;
  return v === 'true' || v === '1' || v === 'yes' || v === 'y';
}

function defaultJobConditions() {
  return {
    locationLabel: '',
    locationLabelSource: 'manual',
    travelDistanceMiles: null,
    installerCount: 2,
    locationTaxPercent: null,
    materialOnlyTax: true,
    defaultProposalVisibility: 'customer_visible',
    suppressAutoLaborForInstallServiceRows: true,
    sourceQuoteExtractMode: 'replace_existing',
    unionWage: false,
    unionWageMultiplier: 1,
    prevailingWage: false,
    prevailingWageMultiplier: 1,
    laborRateBasis: 'union',
    laborRateMultiplier: 1,
    floors: 1,
    floorMultiplierPerFloor: 0,
    elevatorAvailable: true,
    occupiedBuilding: false,
    occupiedBuildingMultiplier: 0,
    restrictedAccess: false,
    restrictedAccessMultiplier: 0,
    afterHoursWork: false,
    afterHoursMultiplier: 0,
    nightWork: false,
    nightWorkLaborCostMultiplier: 1,
    nightWorkLaborMinutesMultiplier: 1,
    phasedWork: false,
    phasedWorkPhases: 1,
    phasedWorkMultiplier: 1,
    deliveryDifficulty: 'standard',
    deliveryRequired: false,
    deliveryPricingMode: 'included',
    deliveryValue: 0,
    deliveryLeadDays: 0,
    deliveryAutoCalculated: false,
    deliveryQuotedSeparately: false,
    smallJobFactor: false,
    smallJobMultiplier: 1,
    mobilizationComplexity: 'low',
    remoteTravel: false,
    remoteTravelMultiplier: 1,
    scheduleCompression: false,
    scheduleCompressionMultiplier: 1,
    performanceBondRequired: false,
    performanceBondPercent: 0,
    estimateAdderPercent: 0,
    estimateAdderAmount: 0,
    installerPaidDayHours: 8,
    dailyBreakHoursPerInstaller: 1,
    fieldSetupCleanupHoursPerInstallerDay: 0.5,
    laborLearningCurvePercent: 0,
    materialWastePercent: 0,
    installerFieldSuppliesPercent: 0,
    installerFieldSuppliesFlat: 0,
  } as ProjectRecord['jobConditions'];
}

function mapProjectToSheetRow(project: ProjectRecord): SheetsRow {
  return {
    ProjectID: project.id,
    ProjectNumber: project.projectNumber || '',
    ProjectName: project.projectName,
    ClientName: project.clientName || '',
    GeneralContractor: project.generalContractor || '',
    Estimator: project.estimator || '',
    BidDate: project.bidDate || '',
    ProposalDate: project.proposalDate || '',
    DueDate: project.dueDate || '',
    Address: project.address || '',
    ProjectType: project.projectType || '',
    ProjectSize: project.projectSize || '',
    FloorLevel: project.floorLevel || '',
    AccessDifficulty: project.accessDifficulty || '',
    InstallHeight: project.installHeight || '',
    MaterialHandling: project.materialHandling || '',
    WallSubstrate: project.wallSubstrate || '',
    LaborBurdenPercent: project.laborBurdenPercent,
    OverheadPercent: project.overheadPercent,
    ProfitPercent: project.profitPercent,
    LaborOverheadPercent: project.laborOverheadPercent,
    LaborProfitPercent: project.laborProfitPercent,
    SubLaborManagementFeeEnabled: project.subLaborManagementFeeEnabled ? 'TRUE' : 'FALSE',
    SubLaborManagementFeePercent: project.subLaborManagementFeePercent,
    TaxPercent: project.taxPercent,
    PricingMode: project.pricingMode,
    SelectedScopeCategories: JSON.stringify(project.selectedScopeCategories || []),
    PreferredBrands: JSON.stringify(project.preferredBrands || []),
    JobConditions: JSON.stringify(project.jobConditions || defaultJobConditions()),
    Status: project.status,
    Notes: project.notes || '',
    SpecialNotes: project.specialNotes || '',
    ProposalIncludeSpecialNotes: project.proposalIncludeSpecialNotes ? 'TRUE' : 'FALSE',
    ProposalIncludeCatalogImages: project.proposalIncludeCatalogImages ? 'TRUE' : 'FALSE',
    ProposalFormat: project.proposalFormat,
    StructuredAssumptions: JSON.stringify(project.structuredAssumptions || []),
    CreatedAt: project.createdAt,
    UpdatedAt: project.updatedAt,
  };
}

function parseJsonArray(value: string | undefined): string[] {
  const raw = String(value || '').trim();
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map((x) => String(x || '').trim()).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function parseJson<T>(value: string | undefined, fallback: T): T {
  const raw = String(value || '').trim();
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function mapProjectFromSheet(row: Record<string, string>): ProjectRecord {
  const now = new Date().toISOString();
  return {
    id: String(row.ProjectID || '').trim(),
    projectNumber: String(row.ProjectNumber || '').trim() || null,
    projectName: String(row.ProjectName || '').trim() || 'Untitled Project',
    clientName: String(row.ClientName || '').trim() || null,
    generalContractor: String(row.GeneralContractor || '').trim() || null,
    estimator: String(row.Estimator || '').trim() || null,
    bidDate: String(row.BidDate || '').trim() || null,
    proposalDate: String(row.ProposalDate || '').trim() || null,
    dueDate: String(row.DueDate || '').trim() || null,
    address: String(row.Address || '').trim() || null,
    projectType: String(row.ProjectType || '').trim() || null,
    projectSize: String(row.ProjectSize || '').trim() || null,
    floorLevel: String(row.FloorLevel || '').trim() || null,
    accessDifficulty: String(row.AccessDifficulty || '').trim() || null,
    installHeight: String(row.InstallHeight || '').trim() || null,
    materialHandling: String(row.MaterialHandling || '').trim() || null,
    wallSubstrate: String(row.WallSubstrate || '').trim() || null,
    laborBurdenPercent: parseNumber(row.LaborBurdenPercent, 0),
    overheadPercent: parseNumber(row.OverheadPercent, 0),
    profitPercent: parseNumber(row.ProfitPercent, 0),
    laborOverheadPercent: parseNumber(row.LaborOverheadPercent, 0),
    laborProfitPercent: parseNumber(row.LaborProfitPercent, 0),
    subLaborManagementFeeEnabled: parseBoolean(row.SubLaborManagementFeeEnabled, false),
    subLaborManagementFeePercent: parseNumber(row.SubLaborManagementFeePercent, 0),
    taxPercent: parseNumber(row.TaxPercent, 0),
    pricingMode: (String(row.PricingMode || 'labor_and_material').trim() || 'labor_and_material') as ProjectRecord['pricingMode'],
    selectedScopeCategories: parseJsonArray(row.SelectedScopeCategories),
    preferredBrands: parseJsonArray(row.PreferredBrands),
    jobConditions: parseJson(row.JobConditions, defaultJobConditions()),
    status: (String(row.Status || 'Draft').trim() || 'Draft') as ProjectRecord['status'],
    notes: String(row.Notes || '').trim() || null,
    specialNotes: String(row.SpecialNotes || '').trim() || null,
    proposalIncludeSpecialNotes: parseBoolean(row.ProposalIncludeSpecialNotes, false),
    proposalIncludeCatalogImages: parseBoolean(row.ProposalIncludeCatalogImages, false),
    proposalFormat: (String(row.ProposalFormat || 'standard').trim() || 'standard') as ProjectRecord['proposalFormat'],
    structuredAssumptions: parseJson(row.StructuredAssumptions, []),
    createdAt: String(row.CreatedAt || '').trim() || now,
    updatedAt: String(row.UpdatedAt || row.CreatedAt || '').trim() || now,
  };
}

export async function listProjectsFromSheets(): Promise<ProjectRecord[]> {
  const rows = await readRows(SHEETS_TABS.PROJECTS, projectsWorkbookId());
  return rows
    .map(mapProjectFromSheet)
    .filter((project) => project.id)
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
}

export async function getProjectFromSheets(projectId: string): Promise<ProjectRecord | null> {
  const projects = await listProjectsFromSheets();
  return projects.find((project) => project.id === projectId) || null;
}

export async function createProjectInSheets(input: Partial<ProjectRecord>): Promise<ProjectRecord> {
  const now = new Date().toISOString();
  const project: ProjectRecord = {
    id: input.id || randomUUID(),
    projectNumber: input.projectNumber ?? null,
    projectName: String(input.projectName || '').trim() || 'Untitled Project',
    clientName: input.clientName ?? null,
    generalContractor: input.generalContractor ?? null,
    estimator: input.estimator ?? null,
    bidDate: input.bidDate ?? null,
    proposalDate: input.proposalDate ?? null,
    dueDate: input.dueDate ?? null,
    address: input.address ?? null,
    projectType: input.projectType ?? null,
    projectSize: input.projectSize ?? null,
    floorLevel: input.floorLevel ?? null,
    accessDifficulty: input.accessDifficulty ?? null,
    installHeight: input.installHeight ?? null,
    materialHandling: input.materialHandling ?? null,
    wallSubstrate: input.wallSubstrate ?? null,
    laborBurdenPercent: Number(input.laborBurdenPercent || 0) || 0,
    overheadPercent: Number(input.overheadPercent || 0) || 0,
    profitPercent: Number(input.profitPercent || 0) || 0,
    laborOverheadPercent: Number(input.laborOverheadPercent || 0) || 0,
    laborProfitPercent: Number(input.laborProfitPercent || 0) || 0,
    subLaborManagementFeeEnabled: Boolean(input.subLaborManagementFeeEnabled),
    subLaborManagementFeePercent: Number(input.subLaborManagementFeePercent || 0) || 0,
    taxPercent: Number(input.taxPercent || 0) || 0,
    pricingMode: (input.pricingMode || 'labor_and_material') as ProjectRecord['pricingMode'],
    selectedScopeCategories: input.selectedScopeCategories || [],
    preferredBrands: input.preferredBrands || [],
    jobConditions: input.jobConditions || defaultJobConditions(),
    status: (input.status || 'Draft') as ProjectRecord['status'],
    notes: input.notes ?? null,
    specialNotes: input.specialNotes ?? null,
    proposalIncludeSpecialNotes: Boolean(input.proposalIncludeSpecialNotes),
    proposalIncludeCatalogImages: Boolean(input.proposalIncludeCatalogImages),
    proposalFormat: (input.proposalFormat || 'standard') as ProjectRecord['proposalFormat'],
    structuredAssumptions: input.structuredAssumptions || [],
    createdAt: now,
    updatedAt: now,
  };

  await upsertRowById(SHEETS_TABS.PROJECTS, 'ProjectID', mapProjectToSheetRow(project), projectsWorkbookId());
  return project;
}

export async function updateProjectInSheets(projectId: string, input: Partial<ProjectRecord>): Promise<ProjectRecord | null> {
  const existing = await getProjectFromSheets(projectId);
  if (!existing) return null;
  const next: ProjectRecord = {
    ...existing,
    ...input,
    id: projectId,
    updatedAt: new Date().toISOString(),
  };
  await upsertRowById(SHEETS_TABS.PROJECTS, 'ProjectID', mapProjectToSheetRow(next), projectsWorkbookId());
  return next;
}

export async function archiveProjectInSheets(projectId: string): Promise<ProjectRecord | null> {
  return updateProjectInSheets(projectId, { status: 'Archived' });
}

export async function deleteProjectInSheets(projectId: string): Promise<boolean> {
  const archived = await archiveProjectInSheets(projectId);
  return Boolean(archived);
}
