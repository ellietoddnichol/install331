import { randomUUID } from 'crypto';
import { estimatorDb } from '../db/connection.ts';
import { ProjectRecord } from '../../shared/types/estimator.ts';
import { createDefaultProjectJobConditions, normalizeProjectJobConditions } from '../../shared/utils/jobConditions.ts';

function mapProjectRow(row: any): ProjectRecord {
  let parsedJobConditions = createDefaultProjectJobConditions();
  let selectedScopeCategories: string[] = [];
  try {
    parsedJobConditions = normalizeProjectJobConditions(JSON.parse(row.job_conditions_json || '{}'));
  } catch {
    parsedJobConditions = createDefaultProjectJobConditions();
  }

  try {
    const parsed = JSON.parse(row.scope_categories_json || '[]');
    selectedScopeCategories = Array.isArray(parsed)
      ? parsed.map((entry) => String(entry || '').trim()).filter(Boolean)
      : [];
  } catch {
    selectedScopeCategories = [];
  }

  return {
    id: row.id,
    projectNumber: row.project_number,
    projectName: row.project_name,
    clientName: row.client_name,
    generalContractor: row.general_contractor,
    estimator: row.estimator,
    bidDate: row.bid_date,
    proposalDate: row.proposal_date,
    dueDate: row.due_date,
    address: row.address,
    projectType: row.project_type,
    projectSize: row.project_size,
    floorLevel: row.floor_level,
    accessDifficulty: row.access_difficulty,
    installHeight: row.install_height,
    materialHandling: row.material_handling,
    wallSubstrate: row.wall_substrate,
    laborBurdenPercent: row.labor_burden_percent,
    overheadPercent: row.overhead_percent,
    profitPercent: row.profit_percent,
    taxPercent: row.tax_percent,
    pricingMode: row.pricing_mode || 'labor_and_material',
    selectedScopeCategories,
    jobConditions: parsedJobConditions,
    status: row.status,
    notes: row.notes,
    specialNotes: row.special_notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function listProjects(): ProjectRecord[] {
  const rows = estimatorDb.prepare('SELECT * FROM projects_v1 ORDER BY updated_at DESC').all();
  return rows.map(mapProjectRow);
}

export function getProject(projectId: string): ProjectRecord | null {
  const row = estimatorDb.prepare('SELECT * FROM projects_v1 WHERE id = ?').get(projectId);
  return row ? mapProjectRow(row) : null;
}

export function createProject(input: Partial<ProjectRecord>): ProjectRecord {
  const now = new Date().toISOString();
  const project: ProjectRecord = {
    id: input.id ?? randomUUID(),
    projectNumber: input.projectNumber ?? null,
    projectName: input.projectName ?? 'Untitled Project',
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
    laborBurdenPercent: input.laborBurdenPercent ?? 25,
    overheadPercent: input.overheadPercent ?? 15,
    profitPercent: input.profitPercent ?? 10,
    taxPercent: input.taxPercent ?? 8.25,
    pricingMode: input.pricingMode ?? 'labor_and_material',
    selectedScopeCategories: Array.isArray(input.selectedScopeCategories)
      ? input.selectedScopeCategories.map((entry) => String(entry || '').trim()).filter(Boolean)
      : [],
    jobConditions: normalizeProjectJobConditions(input.jobConditions),
    status: input.status ?? 'Draft',
    notes: input.notes ?? null,
    specialNotes: input.specialNotes ?? null,
    createdAt: now,
    updatedAt: now
  };

  estimatorDb.prepare(`
    INSERT INTO projects_v1 (
      id, project_number, project_name, client_name, general_contractor, estimator, bid_date, proposal_date, due_date, address, project_type,
      project_size, floor_level, access_difficulty, install_height, material_handling, wall_substrate,
      labor_burden_percent, overhead_percent, profit_percent, tax_percent, pricing_mode, scope_categories_json, job_conditions_json, status, notes, special_notes, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    project.id,
    project.projectNumber,
    project.projectName,
    project.clientName,
    project.generalContractor,
    project.estimator,
    project.bidDate,
    project.proposalDate,
    project.dueDate,
    project.address,
    project.projectType,
    project.projectSize,
    project.floorLevel,
    project.accessDifficulty,
    project.installHeight,
    project.materialHandling,
    project.wallSubstrate,
    project.laborBurdenPercent,
    project.overheadPercent,
    project.profitPercent,
    project.taxPercent,
    project.pricingMode,
    JSON.stringify(project.selectedScopeCategories),
    JSON.stringify(project.jobConditions),
    project.status,
    project.notes,
    project.specialNotes,
    project.createdAt,
    project.updatedAt
  );

  return project;
}

export function updateProject(projectId: string, input: Partial<ProjectRecord>): ProjectRecord | null {
  const existing = getProject(projectId);
  if (!existing) return null;

  const next: ProjectRecord = {
    ...existing,
    ...input,
    selectedScopeCategories: Array.isArray(input.selectedScopeCategories)
      ? input.selectedScopeCategories.map((entry) => String(entry || '').trim()).filter(Boolean)
      : existing.selectedScopeCategories,
    jobConditions: normalizeProjectJobConditions(input.jobConditions ?? existing.jobConditions),
    id: projectId,
    updatedAt: new Date().toISOString()
  };

  estimatorDb.prepare(`
    UPDATE projects_v1 SET
      project_number = ?, project_name = ?, client_name = ?, general_contractor = ?, estimator = ?, bid_date = ?, proposal_date = ?, due_date = ?,
      address = ?, project_type = ?, project_size = ?, floor_level = ?, access_difficulty = ?, install_height = ?,
      material_handling = ?, wall_substrate = ?, labor_burden_percent = ?, overhead_percent = ?,
      profit_percent = ?, tax_percent = ?, pricing_mode = ?, scope_categories_json = ?, job_conditions_json = ?, status = ?, notes = ?, special_notes = ?, updated_at = ?
    WHERE id = ?
  `).run(
    next.projectNumber,
    next.projectName,
    next.clientName,
    next.generalContractor,
    next.estimator,
    next.bidDate,
    next.proposalDate,
    next.dueDate,
    next.address,
    next.projectType,
    next.projectSize,
    next.floorLevel,
    next.accessDifficulty,
    next.installHeight,
    next.materialHandling,
    next.wallSubstrate,
    next.laborBurdenPercent,
    next.overheadPercent,
    next.profitPercent,
    next.taxPercent,
    next.pricingMode,
    JSON.stringify(next.selectedScopeCategories),
    JSON.stringify(next.jobConditions),
    next.status,
    next.notes,
    next.specialNotes,
    next.updatedAt,
    projectId
  );

  return next;
}

export function archiveProject(projectId: string): boolean {
  const result = estimatorDb.prepare(`
    UPDATE projects_v1 SET status = 'Archived', updated_at = ? WHERE id = ?
  `).run(new Date().toISOString(), projectId);
  return result.changes > 0;
}

export function deleteProject(projectId: string): boolean {
  const result = estimatorDb.prepare('DELETE FROM projects_v1 WHERE id = ?').run(projectId);
  return result.changes > 0;
}
