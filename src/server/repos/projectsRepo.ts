import { randomUUID } from 'crypto';
import { dbAll, dbGet, dbRun } from '../db/query.ts';
import { PeerIntakeDefaultsResponse, ProjectRecord, ProjectStructuredAssumption } from '../../shared/types/estimator.ts';
import { coerceSafeProjectName } from '../../shared/utils/intakeTextGuards.ts';
import { createDefaultProjectJobConditions, normalizeProjectJobConditions } from '../../shared/utils/jobConditions.ts';
import {
  generateBidPackageNumber,
  inferDefaultClientName,
  inferDefaultLocationFromProjectTitle,
  isBlankOrPlaceholderBidNumber,
  logProjectAutofill,
  titleStringForInference,
} from '../services/projectDefaults.ts';

function coerceProposalFormat(raw: unknown): ProjectRecord['proposalFormat'] {
  const s = String(raw || '').trim();
  if (s === 'condensed' || s === 'schedule_with_amounts' || s === 'executive_summary') return s;
  return 'standard';
}

function coerceStructuredAssumptionSource(raw: unknown): ProjectStructuredAssumption['source'] {
  const s = String(raw || '').trim();
  if (s === 'peer' || s === 'manual') return s;
  return 'intake';
}

export function parseStructuredAssumptionsJson(raw: string | null | undefined): ProjectStructuredAssumption[] {
  try {
    const parsed = JSON.parse(raw || '[]');
    if (!Array.isArray(parsed)) return [];
    const out: ProjectStructuredAssumption[] = [];
    for (const entry of parsed) {
      if (!entry || typeof entry !== 'object') continue;
      const e = entry as Record<string, unknown>;
      const text = String(e.text || '').trim();
      if (!text) continue;
      const conf = Number(e.confidence);
      out.push({
        id: String(e.id || randomUUID()),
        source: coerceStructuredAssumptionSource(e.source),
        ruleId: e.ruleId != null ? String(e.ruleId) : undefined,
        text,
        confidence: Number.isFinite(conf) ? Math.min(1, Math.max(0, conf)) : 0.75,
        appliedFields: Array.isArray(e.appliedFields) ? e.appliedFields.map((x) => String(x)) : undefined,
        createdAt: String(e.createdAt || new Date().toISOString()),
      });
    }
    return out;
  } catch {
    return [];
  }
}

function normalizeStructuredAssumptionsInput(input: ProjectStructuredAssumption[] | undefined | null): ProjectStructuredAssumption[] {
  if (!Array.isArray(input)) return [];
  return parseStructuredAssumptionsJson(JSON.stringify(input));
}

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

  const structuredAssumptions = parseStructuredAssumptionsJson(row.structured_assumptions_json);

  return {
    id: row.id,
    projectNumber: row.project_number,
    projectNumberSource: (row.project_number_source === 'auto' ? 'auto' : 'manual'),
    projectName: coerceSafeProjectName(String(row.project_name || ''), 'Untitled Project'),
    clientName: row.client_name,
    clientNameSource: (row.client_name_source === 'auto' ? 'auto' : 'manual'),
    generalContractor: row.general_contractor,
    estimator: row.estimator,
    bidDate: row.bid_date,
    proposalDate: row.proposal_date,
    dueDate: row.due_date,
    address: row.address,
    addressSource: (row.address_source === 'auto' ? 'auto' : 'manual'),
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
    laborOverheadPercent: Number(row.labor_overhead_percent ?? 0),
    laborProfitPercent: Number(row.labor_profit_percent ?? 0),
    subLaborManagementFeeEnabled: Boolean(Number(row.sub_labor_management_fee_enabled ?? 0)),
    subLaborManagementFeePercent: Number(row.sub_labor_management_fee_percent ?? 5),
    taxPercent: row.tax_percent,
    pricingMode: row.pricing_mode || 'labor_and_material',
    selectedScopeCategories,
    jobConditions: { ...parsedJobConditions, locationLabelSource: (row.location_label_source === 'auto' ? 'auto' : 'manual') },
    status: row.status,
    notes: row.notes,
    specialNotes: row.special_notes,
    proposalIncludeSpecialNotes: Boolean(Number(row.proposal_include_special_notes ?? 0)),
    proposalIncludeCatalogImages: Boolean(Number(row.proposal_include_catalog_images ?? 0)),
    proposalFormat: coerceProposalFormat(row.proposal_format),
    structuredAssumptions,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listProjects(): Promise<ProjectRecord[]> {
  const rows = await dbAll('SELECT * FROM projects_v1 ORDER BY updated_at DESC');
  return rows.map(mapProjectRow);
}

export async function getProject(projectId: string): Promise<ProjectRecord | null> {
  const row = await dbGet('SELECT * FROM projects_v1 WHERE id = ?', [projectId]);
  return row ? mapProjectRow(row) : null;
}

/**
 * Best-effort defaults from the most recently updated non-archived project with the same client (preferred) or GC.
 */
export async function suggestPeerIntakeDefaults(input: {
  clientName?: string | null;
  generalContractor?: string | null;
  excludeProjectId?: string | null;
}): Promise<PeerIntakeDefaultsResponse | null> {
  const client = String(input.clientName || '').trim().toLowerCase();
  const gc = String(input.generalContractor || '').trim().toLowerCase();
  if (!client && !gc) return null;

  let row: any = null;
  let matchedBy: PeerIntakeDefaultsResponse['matchedBy'] = null;

  if (client) {
    if (input.excludeProjectId) {
      row = await dbGet(
        `SELECT * FROM projects_v1 WHERE status != 'Archived' AND id != ? AND LOWER(TRIM(COALESCE(client_name,''))) = ? ORDER BY updated_at DESC LIMIT 1`,
        [input.excludeProjectId, client]
      );
    } else {
      row = await dbGet(
        `SELECT * FROM projects_v1 WHERE status != 'Archived' AND LOWER(TRIM(COALESCE(client_name,''))) = ? ORDER BY updated_at DESC LIMIT 1`,
        [client]
      );
    }
    if (row) matchedBy = 'client';
  }

  if (!row && gc) {
    if (input.excludeProjectId) {
      row = await dbGet(
        `SELECT * FROM projects_v1 WHERE status != 'Archived' AND id != ? AND LOWER(TRIM(COALESCE(general_contractor,''))) = ? ORDER BY updated_at DESC LIMIT 1`,
        [input.excludeProjectId, gc]
      );
    } else {
      row = await dbGet(
        `SELECT * FROM projects_v1 WHERE status != 'Archived' AND LOWER(TRIM(COALESCE(general_contractor,''))) = ? ORDER BY updated_at DESC LIMIT 1`,
        [gc]
      );
    }
    if (row) matchedBy = 'general_contractor';
  }

  if (!row) return null;

  const mapped = mapProjectRow(row);
  return {
    sourceProjectId: mapped.id,
    matchedBy,
    jobConditions: mapped.jobConditions,
    selectedScopeCategories: mapped.selectedScopeCategories,
    pricingMode: mapped.pricingMode,
    taxPercent: mapped.taxPercent,
  };
}

export async function createProject(input: Partial<ProjectRecord>): Promise<ProjectRecord> {
  const now = new Date().toISOString();
  const structuredAssumptions = normalizeStructuredAssumptionsInput(input.structuredAssumptions ?? []);
  const rawTitle = titleStringForInference(String(input.projectName ?? ''));
  const projectName = coerceSafeProjectName(String(input.projectName ?? ''), 'Untitled Project');
  const projectId = input.id ?? randomUUID();
  const titleForDefaults = rawTitle || projectName;

  const projectNumberRaw = String(input.projectNumber ?? '').trim();
  const shouldAutofillBid = isBlankOrPlaceholderBidNumber(projectNumberRaw);
  const clientNameRaw = String(input.clientName ?? '').trim();
  const addressRaw = String(input.address ?? '').trim();

  logProjectAutofill('create.begin', {
    rawTitleLen: rawTitle.length,
    coercedName: projectName,
    projectNumberBlank: shouldAutofillBid,
    clientBlank: !clientNameRaw,
    addressBlank: !addressRaw,
  });

  const projectNumberAuto = shouldAutofillBid ? generateBidPackageNumber({ projectId, projectName }) : null;
  const clientAuto = clientNameRaw ? null : inferDefaultClientName({ projectName: titleForDefaults });
  const locationAuto = addressRaw ? null : inferDefaultLocationFromProjectTitle({ projectName: titleForDefaults });

  logProjectAutofill('create.inferred', {
    bidPackageGenerated: Boolean(projectNumberAuto),
    clientInferred: Boolean(clientAuto),
    locationMatched: Boolean(locationAuto),
    locationReason: locationAuto?.reason ?? null,
  });

  const project: ProjectRecord = {
    id: projectId,
    projectNumber: shouldAutofillBid ? (projectNumberAuto as string) : projectNumberRaw,
    projectNumberSource: shouldAutofillBid ? 'auto' : 'manual',
    projectName,
    clientName: clientNameRaw || (clientAuto ? clientAuto.clientName : null),
    clientNameSource: clientNameRaw ? 'manual' : clientAuto ? 'auto' : 'manual',
    generalContractor: input.generalContractor ?? null,
    estimator: input.estimator ?? null,
    bidDate: input.bidDate ?? null,
    proposalDate: input.proposalDate ?? null,
    dueDate: input.dueDate ?? null,
    address: addressRaw || (locationAuto ? locationAuto.address : null),
    addressSource: addressRaw ? 'manual' : locationAuto ? 'auto' : 'manual',
    projectType: input.projectType ?? null,
    projectSize: input.projectSize ?? null,
    floorLevel: input.floorLevel ?? null,
    accessDifficulty: input.accessDifficulty ?? null,
    installHeight: input.installHeight ?? null,
    materialHandling: input.materialHandling ?? null,
    wallSubstrate: input.wallSubstrate ?? null,
    laborBurdenPercent: input.laborBurdenPercent ?? 0,
    overheadPercent: input.overheadPercent ?? 15,
    profitPercent: input.profitPercent ?? 0,
    laborOverheadPercent: input.laborOverheadPercent ?? 5,
    laborProfitPercent: input.laborProfitPercent ?? 0,
    subLaborManagementFeeEnabled: input.subLaborManagementFeeEnabled ?? false,
    subLaborManagementFeePercent: input.subLaborManagementFeePercent ?? 5,
    taxPercent: input.taxPercent ?? 8.25,
    pricingMode: input.pricingMode ?? 'labor_and_material',
    selectedScopeCategories: Array.isArray(input.selectedScopeCategories)
      ? input.selectedScopeCategories.map((entry) => String(entry || '').trim()).filter(Boolean)
      : [],
    jobConditions: normalizeProjectJobConditions({
      ...(input.jobConditions || {}),
      locationLabel: (input.jobConditions as any)?.locationLabel || (locationAuto ? locationAuto.locationLabel : ''),
    }),
    status: input.status ?? 'Draft',
    notes: input.notes ?? null,
    specialNotes: input.specialNotes ?? null,
    proposalIncludeSpecialNotes: Boolean(input.proposalIncludeSpecialNotes),
    proposalIncludeCatalogImages: Boolean(input.proposalIncludeCatalogImages),
    proposalFormat: coerceProposalFormat(input.proposalFormat),
    structuredAssumptions,
    createdAt: now,
    updatedAt: now,
  };

  await dbRun(
    `
    INSERT INTO projects_v1 (
      id, project_number, project_number_source, project_name, client_name, client_name_source, general_contractor, estimator, bid_date, proposal_date, due_date,
      address, address_source, location_label_source,
      project_type,
      project_size, floor_level, access_difficulty, install_height, material_handling, wall_substrate,
      labor_burden_percent, overhead_percent, profit_percent, labor_overhead_percent, labor_profit_percent,
      sub_labor_management_fee_enabled, sub_labor_management_fee_percent,
      tax_percent, pricing_mode, scope_categories_json, job_conditions_json, status, notes, special_notes, proposal_include_special_notes, proposal_include_catalog_images, proposal_format,
      structured_assumptions_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
    [
      project.id,
      project.projectNumber,
      project.projectNumberSource || 'manual',
      project.projectName,
      project.clientName,
      project.clientNameSource || 'manual',
      project.generalContractor,
      project.estimator,
      project.bidDate,
      project.proposalDate,
      project.dueDate,
      project.address,
      project.addressSource || 'manual',
      project.jobConditions.locationLabelSource || (locationAuto ? 'auto' : 'manual'),
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
      project.laborOverheadPercent,
      project.laborProfitPercent,
      project.subLaborManagementFeeEnabled ? 1 : 0,
      project.subLaborManagementFeePercent,
      project.taxPercent,
      project.pricingMode,
      JSON.stringify(project.selectedScopeCategories),
      JSON.stringify(project.jobConditions),
      project.status,
      project.notes,
      project.specialNotes,
      project.proposalIncludeSpecialNotes ? 1 : 0,
      project.proposalIncludeCatalogImages ? 1 : 0,
      project.proposalFormat,
      JSON.stringify(project.structuredAssumptions),
      project.createdAt,
      project.updatedAt,
    ]
  );

  return project;
}

export async function updateProject(projectId: string, input: Partial<ProjectRecord>): Promise<ProjectRecord | null> {
  const existing = await getProject(projectId);
  if (!existing) return null;

  const hasIncomingProjectNumber = Object.prototype.hasOwnProperty.call(input, 'projectNumber');
  const incomingProjectNumber = hasIncomingProjectNumber ? String(input.projectNumber ?? '').trim() : null;

  const hasIncomingClientName = Object.prototype.hasOwnProperty.call(input, 'clientName');
  const incomingClientName = hasIncomingClientName ? String(input.clientName ?? '').trim() : null;

  const hasIncomingAddress = Object.prototype.hasOwnProperty.call(input, 'address');
  const incomingAddress = hasIncomingAddress ? String(input.address ?? '').trim() : null;

  const hasIncomingLocationLabel =
    input.jobConditions != null &&
    Object.prototype.hasOwnProperty.call(input.jobConditions, 'locationLabel');
  const incomingLocationLabel = hasIncomingLocationLabel
    ? String((input.jobConditions as any).locationLabel ?? '').trim()
    : null;

  const mergedJobConditionsForNormalize = normalizeProjectJobConditions({
    ...existing.jobConditions,
    ...(input.jobConditions || {}),
  });

  const next: ProjectRecord = {
    ...existing,
    ...input,
    proposalFormat: input.proposalFormat !== undefined ? coerceProposalFormat(input.proposalFormat) : existing.proposalFormat,
    selectedScopeCategories: Array.isArray(input.selectedScopeCategories)
      ? input.selectedScopeCategories.map((entry) => String(entry || '').trim()).filter(Boolean)
      : existing.selectedScopeCategories,
    jobConditions: mergedJobConditionsForNormalize,
    structuredAssumptions: Array.isArray(input.structuredAssumptions)
      ? normalizeStructuredAssumptionsInput(input.structuredAssumptions)
      : existing.structuredAssumptions,
    id: projectId,
    updatedAt: new Date().toISOString(),
  };

  const rawTitle = titleStringForInference(
    input.projectName !== undefined ? String(input.projectName) : existing.projectName
  );
  next.projectName = coerceSafeProjectName(next.projectName, 'Untitled Project');
  const titleForDefaults = rawTitle || next.projectName;

  const existingNeedsBid = isBlankOrPlaceholderBidNumber(String(existing.projectNumber ?? ''));
  const shouldAutofillBidOnUpdate =
    existingNeedsBid &&
    (!hasIncomingProjectNumber ||
      incomingProjectNumber === null ||
      incomingProjectNumber === '' ||
      (incomingProjectNumber != null && isBlankOrPlaceholderBidNumber(incomingProjectNumber)));

  logProjectAutofill('update.begin', {
    projectId,
    hasIncomingProjectNumber,
    hasIncomingAddress,
    hasIncomingLocationLabel,
    existingProjectNumberBlank: existingNeedsBid,
    existingAddressBlank: !String(existing.address || '').trim(),
    titleForDefaultsSample: titleForDefaults.slice(0, 80),
  });

  // Default only when blank, and never regenerate on unrelated edits.
  if (shouldAutofillBidOnUpdate) {
    next.projectNumber = generateBidPackageNumber({ projectId, projectName: next.projectName });
    next.projectNumberSource = 'auto';
    logProjectAutofill('update.filled.projectNumber', { source: 'generateBidPackageNumber' });
  } else if (hasIncomingProjectNumber) {
    if (incomingProjectNumber === '' && !existingNeedsBid) {
      // Full PUT often serializes empty optional fields as "" / null — do not wipe a stored value.
      next.projectNumber = existing.projectNumber;
      next.projectNumberSource = existing.projectNumberSource;
      logProjectAutofill('update.preserved.projectNumber', { reason: 'incoming_empty_kept_existing' });
    } else {
      next.projectNumber = incomingProjectNumber || null;
      next.projectNumberSource = incomingProjectNumber ? 'manual' : existing.projectNumberSource;
    }
  }

  if (!String(existing.clientName || '').trim() && (incomingClientName === null || incomingClientName === '')) {
    const inferred = inferDefaultClientName({ projectName: titleForDefaults });
    if (inferred) {
      next.clientName = inferred.clientName;
      next.clientNameSource = 'auto';
      logProjectAutofill('update.filled.clientName', { reason: inferred.reason });
    }
  } else if (hasIncomingClientName) {
    if (incomingClientName === '' && String(existing.clientName || '').trim()) {
      next.clientName = existing.clientName;
      next.clientNameSource = existing.clientNameSource;
    } else {
      next.clientName = incomingClientName || null;
      next.clientNameSource = incomingClientName ? 'manual' : existing.clientNameSource;
    }
  }

  if (!String(existing.address || '').trim() && (incomingAddress === null || incomingAddress === '')) {
    const inferred = inferDefaultLocationFromProjectTitle({ projectName: titleForDefaults });
    if (inferred) {
      next.address = inferred.address;
      next.addressSource = 'auto';
      logProjectAutofill('update.filled.address', { reason: inferred.reason });
    }
  } else if (hasIncomingAddress) {
    if (incomingAddress === '' && String(existing.address || '').trim()) {
      next.address = existing.address;
      next.addressSource = existing.addressSource;
      logProjectAutofill('update.preserved.address', { reason: 'incoming_empty_kept_existing' });
    } else {
      next.address = incomingAddress || null;
      next.addressSource = incomingAddress ? 'manual' : existing.addressSource;
    }
  }

  const existingLoc = String(existing.jobConditions?.locationLabel || '').trim();
  if (!existingLoc && (incomingLocationLabel === null || incomingLocationLabel === '')) {
    const inferred = inferDefaultLocationFromProjectTitle({ projectName: titleForDefaults });
    if (inferred) {
      next.jobConditions = normalizeProjectJobConditions({
        ...next.jobConditions,
        locationLabel: inferred.locationLabel,
        locationLabelSource: 'auto',
      });
      logProjectAutofill('update.filled.locationLabel', { reason: inferred.reason });
    } else {
      logProjectAutofill('update.skipped.locationLabel', { reason: 'no_title_match' });
    }
  } else if (hasIncomingLocationLabel) {
    if (incomingLocationLabel === '' && String(existingLoc)) {
      next.jobConditions = normalizeProjectJobConditions({
        ...next.jobConditions,
        locationLabel: existing.jobConditions?.locationLabel || '',
        locationLabelSource: (existing.jobConditions as any)?.locationLabelSource,
      });
      logProjectAutofill('update.preserved.locationLabel', { reason: 'incoming_empty_kept_existing' });
    } else {
      next.jobConditions = normalizeProjectJobConditions({
        ...next.jobConditions,
        locationLabel: incomingLocationLabel,
        locationLabelSource: incomingLocationLabel ? 'manual' : (existing.jobConditions as any)?.locationLabelSource,
      });
    }
  }

  await dbRun(
    `
    UPDATE projects_v1 SET
      project_number = ?, project_number_source = ?, project_name = ?, client_name = ?, client_name_source = ?, general_contractor = ?, estimator = ?, bid_date = ?, proposal_date = ?, due_date = ?,
      address = ?, address_source = ?, location_label_source = ?, project_type = ?, project_size = ?, floor_level = ?, access_difficulty = ?, install_height = ?,
      material_handling = ?, wall_substrate = ?, labor_burden_percent = ?, overhead_percent = ?,
      profit_percent = ?, labor_overhead_percent = ?, labor_profit_percent = ?,
      sub_labor_management_fee_enabled = ?, sub_labor_management_fee_percent = ?,
      tax_percent = ?, pricing_mode = ?, scope_categories_json = ?, job_conditions_json = ?, status = ?, notes = ?, special_notes = ?, proposal_include_special_notes = ?, proposal_include_catalog_images = ?, proposal_format = ?,
      structured_assumptions_json = ?, updated_at = ?
    WHERE id = ?
  `,
    [
      next.projectNumber,
      next.projectNumberSource || 'manual',
      next.projectName,
      next.clientName,
      next.clientNameSource || 'manual',
      next.generalContractor,
      next.estimator,
      next.bidDate,
      next.proposalDate,
      next.dueDate,
      next.address,
      next.addressSource || 'manual',
      (next.jobConditions as any)?.locationLabelSource || 'manual',
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
      next.laborOverheadPercent,
      next.laborProfitPercent,
      next.subLaborManagementFeeEnabled ? 1 : 0,
      next.subLaborManagementFeePercent,
      next.taxPercent,
      next.pricingMode,
      JSON.stringify(next.selectedScopeCategories),
      JSON.stringify(next.jobConditions),
      next.status,
      next.notes,
      next.specialNotes,
      next.proposalIncludeSpecialNotes ? 1 : 0,
      next.proposalIncludeCatalogImages ? 1 : 0,
      next.proposalFormat,
      JSON.stringify(next.structuredAssumptions),
      next.updatedAt,
      projectId,
    ]
  );

  return next;
}

export async function archiveProject(projectId: string): Promise<boolean> {
  const result = await dbRun(`UPDATE projects_v1 SET status = 'Archived', updated_at = ? WHERE id = ?`, [
    new Date().toISOString(),
    projectId,
  ]);
  return result.changes > 0;
}

export async function deleteProject(projectId: string): Promise<boolean> {
  const result = await dbRun('DELETE FROM projects_v1 WHERE id = ?', [projectId]);
  return result.changes > 0;
}
