import { randomUUID } from 'crypto';
import { ProjectRecord, ProjectStructuredAssumption, PricingMode } from '../../shared/types/estimator.ts';
import { coerceSafeProjectName } from '../../shared/utils/intakeTextGuards.ts';
import { createDefaultProjectJobConditions, normalizeProjectJobConditions } from '../../shared/utils/jobConditions.ts';

export function coerceProposalFormat(raw: unknown): ProjectRecord['proposalFormat'] {
  const s = String(raw || '').trim();
  if (s === 'condensed' || s === 'schedule_with_amounts' || s === 'executive_summary') return s;
  return 'standard';
}

const VALID_PRICING_MODES: PricingMode[] = [
  'material_only',
  'labor_only',
  'labor_and_material',
  'material_with_optional_install_quote',
];

export function normalizePricingMode(raw: unknown): PricingMode {
  const s = String(raw || '').trim();
  return VALID_PRICING_MODES.includes(s as PricingMode) ? (s as PricingMode) : 'labor_and_material';
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

export function normalizeStructuredAssumptionsInput(input: ProjectStructuredAssumption[] | undefined | null): ProjectStructuredAssumption[] {
  if (!Array.isArray(input)) return [];
  return parseStructuredAssumptionsJson(JSON.stringify(input));
}

export function mapProjectRow(row: any): ProjectRecord {
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
  let preferredBrands: string[] = [];
  try {
    const parsed = JSON.parse(row.preferred_brands_json || '[]');
    preferredBrands = Array.isArray(parsed) ? parsed.map((e) => String(e || '').trim()).filter(Boolean) : [];
  } catch {
    preferredBrands = [];
  }

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
    pricingMode: normalizePricingMode(row.pricing_mode),
    selectedScopeCategories,
    preferredBrands,
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
