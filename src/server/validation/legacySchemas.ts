import { z } from 'zod';

const projectStatus = z.enum(['Draft', 'Submitted', 'Awarded', 'Lost', 'Archived']);

/** Legacy `/api/projects` and `/api/estimate/calculate` body — runtime-validated (TS types are erased). */
export const legacyProjectBodySchema = z.object({
  id: z.string().min(1),
  projectNumber: z.string().nullable().optional(),
  name: z.string().min(1),
  clientName: z.string().min(1),
  gcName: z.string().nullable().optional(),
  address: z.string(),
  bidDate: z.string().nullable().optional(),
  dueDate: z.string().nullable().optional(),
  projectType: z.string().nullable().optional(),
  estimator: z.string().nullable().optional(),
  status: projectStatus,
  createdDate: z.string().min(1),
  settings: z.record(z.string(), z.unknown()),
  proposalSettings: z.record(z.string(), z.unknown()),
  scopes: z.array(z.unknown()),
  rooms: z.array(z.unknown()),
  bundles: z.array(z.unknown()),
  alternates: z.array(z.unknown()),
  lines: z.array(z.unknown()),
});

export type LegacyProjectBody = z.infer<typeof legacyProjectBodySchema>;

/** Allow enum values plus common sheet variants without failing validation at runtime. */
const uom = z.string().min(1).max(16);

export const legacyCatalogItemBodySchema = z.object({
  id: z.string().min(1),
  sku: z.string().min(1),
  category: z.string().min(1),
  subcategory: z.string().nullable().optional(),
  family: z.string().nullable().optional(),
  description: z.string().min(1),
  manufacturer: z.string().nullable().optional(),
  brand: z.string().nullable().optional(),
  model: z.string().nullable().optional(),
  modelNumber: z.string().nullable().optional(),
  series: z.string().nullable().optional(),
  imageUrl: z.string().nullable().optional(),
  uom: uom,
  baseMaterialCost: z.coerce.number().finite(),
  baseLaborMinutes: z.coerce.number().finite(),
  laborUnitType: z.string().nullable().optional(),
  taxable: z.coerce.boolean(),
  adaFlag: z.coerce.boolean(),
  tags: z.array(z.string()).optional(),
  notes: z.string().nullable().optional(),
  active: z.coerce.boolean(),
});

export type LegacyCatalogItemBody = z.infer<typeof legacyCatalogItemBodySchema>;

export const legacyModifierCreateSchema = z.object({
  id: z.string().min(1).optional(),
  name: z.string().min(1),
  modifierKey: z.string().optional(),
  description: z.string().optional(),
  appliesToCategories: z.array(z.string()).optional(),
  addLaborMinutes: z.coerce.number().finite().optional(),
  addMaterialCost: z.coerce.number().finite().optional(),
  percentLabor: z.coerce.number().finite().optional(),
  percentMaterial: z.coerce.number().finite().optional(),
  active: z.coerce.boolean().optional(),
});

export const legacyModifierUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  modifierKey: z.string().optional(),
  description: z.string().optional(),
  appliesToCategories: z.array(z.string()).optional(),
  addLaborMinutes: z.coerce.number().finite().optional(),
  addMaterialCost: z.coerce.number().finite().optional(),
  percentLabor: z.coerce.number().finite().optional(),
  percentMaterial: z.coerce.number().finite().optional(),
  active: z.coerce.boolean().optional(),
});

export const legacyBundleUpdateSchema = z.object({
  bundleName: z.string().min(1).optional(),
  category: z.string().nullable().optional(),
  active: z.coerce.boolean().optional(),
});

/** Global settings blob stored as JSON in SQLite. */
export const legacySettingsBodySchema = z.record(z.string(), z.unknown());
