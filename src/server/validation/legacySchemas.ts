import { z } from 'zod';

/**
 * Runtime validation schemas for the legacy `/api/catalog/*` catalog CRUD routes.
 *
 * The `legacyProjectBodySchema` and `legacySettingsBodySchema` were dropped in the
 * 2026-04-16 cleanup along with the `/projects*`, `/settings*`, and
 * `/estimate/calculate` legacy routes — all live callers use `/api/v1/*`.
 */

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
  /** Install-labor family key used when no catalog labor is present (Phase 0.1/0.2). */
  installLaborFamily: z.string().nullable().optional(),

  // Transitional canonicalization fields.
  canonicalSku: z.string().nullable().optional(),
  isCanonical: z.coerce.boolean().optional(),
  aliasOf: z.string().nullable().optional(),
  laborBasis: z.string().nullable().optional(),
  defaultMountingType: z.string().nullable().optional(),
  finishGroup: z.string().nullable().optional(),
  attributeGroup: z.string().nullable().optional(),
  duplicateGroupKey: z.string().nullable().optional(),
  deprecated: z.coerce.boolean().optional(),
  deprecatedReason: z.string().nullable().optional(),
});

export type LegacyCatalogItemBody = z.infer<typeof legacyCatalogItemBodySchema>;

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
