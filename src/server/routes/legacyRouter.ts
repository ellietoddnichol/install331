import { Router } from 'express';
import type { CatalogItem } from '../../types.ts';
import {
  upsertBundleInGoogleSheet,
  upsertItemInGoogleSheet,
  upsertModifierInGoogleSheet,
} from '../services/googleSheetsCatalogSync.ts';
import { getEstimatorDb } from '../db/connection.ts';
import { listCatalogItemsForApi, searchCatalogItemsForApi } from '../repos/catalogRepo.ts';
import { createCatalogAlias, deleteCatalogAlias, listCatalogAliasesForItem } from '../repos/catalogAliasesRepo.ts';
import { createCatalogAttribute, deactivateCatalogAttribute, listCatalogAttributesForItem } from '../repos/catalogAttributesRepo.ts';
import { handleRouteError } from '../http/jsonErrors.ts';
import {
  legacyBundleUpdateSchema,
  legacyCatalogItemBodySchema,
  legacyModifierUpdateSchema,
} from '../validation/legacySchemas.ts';
import { z } from 'zod';

/**
 * Legacy catalog CRUD endpoints (mounted at `/api`).
 *
 * Retained because the current client still calls these for catalog item, modifier,
 * and bundle edits. The old monolithic `/projects`, `/settings`, `/estimate/calculate`,
 * `/global/*`, and `/sync/sheets` routes were removed in the 2026-04-16 cleanup —
 * all live callers now use `/api/v1/*`.
 */

/** Google Sheets sync is best-effort and must not block saves. */
async function syncCatalogToGoogleSheetOptional(label: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[catalog] Google Sheets sync skipped (${label}): ${message}`);
  }
}

export const legacyRouter = Router();

legacyRouter.get('/health', (_req, res) => res.json({ status: 'ok' }));

legacyRouter.get('/catalog/items', (req, res) => {
  const includeInactive = req.query.includeInactive === '1' || req.query.includeInactive === 'true';
  res.json(listCatalogItemsForApi(includeInactive));
});

legacyRouter.get('/catalog/search', (req, res) => {
  const q = String(req.query.q || '').trim();
  const category = req.query.category ? String(req.query.category) : null;
  const includeInactive = req.query.includeInactive === '1' || req.query.includeInactive === 'true';
  const includeDeprecated = req.query.includeDeprecated === '1' || req.query.includeDeprecated === 'true';
  const includeNonCanonical = req.query.includeNonCanonical === '1' || req.query.includeNonCanonical === 'true';
  try {
    const results = searchCatalogItemsForApi({
      query: q,
      category,
      includeInactive,
      includeDeprecated,
      includeNonCanonical,
      limit: 60,
    });
    res.json(results);
  } catch (err: unknown) {
    handleRouteError(res, err, '[GET /api/catalog/search]');
  }
});

legacyRouter.get('/catalog/items/:id/aliases', (req, res) => {
  try {
    const rows = listCatalogAliasesForItem(req.params.id);
    res.json(
      rows.map((r) => ({
        id: r.id,
        catalogItemId: r.catalogItemId,
        aliasType: r.aliasType,
        aliasValue: r.aliasValue,
      }))
    );
  } catch (err: unknown) {
    handleRouteError(res, err, '[GET /api/catalog/items/:id/aliases]');
  }
});

const createAliasSchema = z.object({
  aliasType: z.enum(['legacy_sku', 'vendor_sku', 'parser_phrase', 'generic_name', 'search_key']),
  aliasValue: z.string().min(1).max(256),
});

legacyRouter.post('/catalog/items/:id/aliases', (req, res) => {
  const parsed = createAliasSchema.safeParse(req.body);
  if (!parsed.success) return handleRouteError(res, parsed.error, '[POST /api/catalog/items/:id/aliases]');
  try {
    const id = crypto.randomUUID();
    const row = createCatalogAlias({
      id,
      catalogItemId: req.params.id,
      aliasType: parsed.data.aliasType,
      aliasValue: parsed.data.aliasValue.trim(),
    });
    res.status(201).json({
      id: row.id,
      catalogItemId: row.catalogItemId,
      aliasType: row.aliasType,
      aliasValue: row.aliasValue,
    });
  } catch (err: unknown) {
    handleRouteError(res, err, '[POST /api/catalog/items/:id/aliases]');
  }
});

legacyRouter.delete('/catalog/item-aliases/:aliasId', (req, res) => {
  try {
    deleteCatalogAlias(req.params.aliasId);
    res.status(204).send();
  } catch (err: unknown) {
    handleRouteError(res, err, '[DELETE /api/catalog/item-aliases/:aliasId]');
  }
});

legacyRouter.get('/catalog/items/:id/attributes', (req, res) => {
  const includeInactive = req.query.includeInactive === '1' || req.query.includeInactive === 'true';
  try {
    const rows = listCatalogAttributesForItem(req.params.id, { includeInactive });
    res.json(
      rows.map((r) => ({
        id: r.id,
        catalogItemId: r.catalogItemId,
        attributeType: r.attributeType,
        attributeValue: r.attributeValue,
        materialDeltaType: r.materialDeltaType,
        materialDeltaValue: r.materialDeltaValue,
        laborDeltaType: r.laborDeltaType,
        laborDeltaValue: r.laborDeltaValue,
        active: r.active,
        sortOrder: r.sortOrder,
      }))
    );
  } catch (err: unknown) {
    handleRouteError(res, err, '[GET /api/catalog/items/:id/attributes]');
  }
});

const createAttributeSchema = z.object({
  attributeType: z.enum(['finish', 'coating', 'grip', 'mounting', 'assembly']),
  attributeValue: z.string().min(1).max(128),
  materialDeltaType: z.enum(['absolute', 'percent', 'minutes']).nullable().optional(),
  materialDeltaValue: z.coerce.number().finite().nullable().optional(),
  laborDeltaType: z.enum(['absolute', 'percent', 'minutes']).nullable().optional(),
  laborDeltaValue: z.coerce.number().finite().nullable().optional(),
  sortOrder: z.coerce.number().int().finite().optional(),
});

legacyRouter.post('/catalog/items/:id/attributes', (req, res) => {
  const parsed = createAttributeSchema.safeParse(req.body);
  if (!parsed.success) return handleRouteError(res, parsed.error, '[POST /api/catalog/items/:id/attributes]');
  try {
    const id = crypto.randomUUID();
    const row = createCatalogAttribute({
      id,
      catalogItemId: req.params.id,
      attributeType: parsed.data.attributeType,
      attributeValue: parsed.data.attributeValue.trim(),
      materialDeltaType: parsed.data.materialDeltaType ?? null,
      materialDeltaValue: parsed.data.materialDeltaValue ?? null,
      laborDeltaType: parsed.data.laborDeltaType ?? null,
      laborDeltaValue: parsed.data.laborDeltaValue ?? null,
      sortOrder: parsed.data.sortOrder ?? 0,
    });
    res.status(201).json({
      id: row.id,
      catalogItemId: row.catalogItemId,
      attributeType: row.attributeType,
      attributeValue: row.attributeValue,
      materialDeltaType: row.materialDeltaType,
      materialDeltaValue: row.materialDeltaValue,
      laborDeltaType: row.laborDeltaType,
      laborDeltaValue: row.laborDeltaValue,
      active: row.active,
      sortOrder: row.sortOrder,
    });
  } catch (err: unknown) {
    handleRouteError(res, err, '[POST /api/catalog/items/:id/attributes]');
  }
});

legacyRouter.delete('/catalog/item-attributes/:attributeId', (req, res) => {
  try {
    deactivateCatalogAttribute(req.params.attributeId);
    res.status(204).send();
  } catch (err: unknown) {
    handleRouteError(res, err, '[DELETE /api/catalog/item-attributes/:attributeId]');
  }
});

legacyRouter.post('/catalog/items', async (req, res) => {
  const parsed = legacyCatalogItemBodySchema.safeParse(req.body);
  if (!parsed.success) return handleRouteError(res, parsed.error, '[POST /api/catalog/items]');
  const i = parsed.data as CatalogItem;
  try {
    getEstimatorDb()
      .prepare(
        `INSERT INTO catalog_items (
          id, sku, canonical_sku, is_canonical, alias_of, category, subcategory, family, description, manufacturer, brand, model, model_number, series, image_url,
          uom, base_material_cost, base_labor_minutes, labor_unit_type, labor_basis, taxable, ada_flag, tags, notes, active, install_labor_family,
          default_mounting_type, finish_group, attribute_group, duplicate_group_key, deprecated, deprecated_reason,
          record_granularity, material_family, system_series, privacy_level,
          manufacturer_configured_item, canonical_match_anchor, exact_component_sku, requires_project_configuration,
          default_unit, estimator_notes
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        i.id,
        i.sku,
        i.canonicalSku ?? i.sku,
        i.isCanonical === false ? 0 : 1,
        i.aliasOf ?? null,
        i.category,
        i.subcategory ?? null,
        i.family ?? null,
        i.description,
        i.manufacturer ?? null,
        i.brand ?? null,
        i.model ?? null,
        i.modelNumber ?? null,
        i.series ?? null,
        i.imageUrl ?? null,
        i.uom,
        i.baseMaterialCost,
        i.baseLaborMinutes,
        i.laborUnitType ?? null,
        i.laborBasis ?? null,
        i.taxable ? 1 : 0,
        i.adaFlag ? 1 : 0,
        JSON.stringify(i.tags ?? []),
        i.notes ?? null,
        i.active ? 1 : 0,
        i.installLaborFamily ?? null,
        i.defaultMountingType ?? null,
        i.finishGroup ?? null,
        i.attributeGroup ?? null,
        i.duplicateGroupKey ?? null,
        i.deprecated ? 1 : 0,
        i.deprecatedReason ?? null,
        i.recordGranularity ?? null,
        i.materialFamily ?? null,
        i.systemSeries ?? null,
        i.privacyLevel ?? null,
        i.manufacturerConfiguredItem ? 1 : 0,
        i.canonicalMatchAnchor ? 1 : 0,
        i.exactComponentSku ? 1 : 0,
        i.requiresProjectConfiguration ? 1 : 0,
        i.defaultUnit ?? null,
        i.estimatorNotes ?? null
      );
    await syncCatalogToGoogleSheetOptional('create item', () =>
      upsertItemInGoogleSheet({
        sku: i.sku,
        category: i.category,
        manufacturer: i.manufacturer ?? null,
        brand: i.brand ?? null,
        model: i.model ?? null,
        modelNumber: i.modelNumber ?? null,
        series: i.series ?? null,
        imageUrl: i.imageUrl ?? null,
        family: i.family ?? null,
        subcategory: i.subcategory ?? null,
        tags: i.tags ?? [],
        description: i.description,
        unit: i.uom,
        baseMaterialCost: i.baseMaterialCost,
        baseLaborMinutes: i.baseLaborMinutes,
        active: i.active,
      })
    );
    res.status(201).json(i);
  } catch (err: unknown) {
    handleRouteError(res, err, '[POST /api/catalog/items]');
  }
});

legacyRouter.put('/catalog/items/:id', async (req, res) => {
  const parsed = legacyCatalogItemBodySchema.safeParse(req.body);
  if (!parsed.success) return handleRouteError(res, parsed.error, '[PUT /api/catalog/items/:id]');
  const i = parsed.data as CatalogItem;
  try {
    getEstimatorDb()
      .prepare(
        `UPDATE catalog_items SET 
          sku = ?, canonical_sku = ?, is_canonical = ?, alias_of = ?,
          category = ?, subcategory = ?, family = ?, description = ?, manufacturer = ?, brand = ?, model = ?, model_number = ?, series = ?, image_url = ?, uom = ?, 
          base_material_cost = ?, base_labor_minutes = ?, labor_unit_type = ?, labor_basis = ?,
          taxable = ?, ada_flag = ?, tags = ?, notes = ?, active = ?, install_labor_family = ?,
          default_mounting_type = ?, finish_group = ?, attribute_group = ?, duplicate_group_key = ?, deprecated = ?, deprecated_reason = ?,
          record_granularity = ?, material_family = ?, system_series = ?, privacy_level = ?,
          manufacturer_configured_item = ?, canonical_match_anchor = ?, exact_component_sku = ?, requires_project_configuration = ?,
          default_unit = ?, estimator_notes = ?
        WHERE id = ?`
      )
      .run(
        i.sku,
        i.canonicalSku ?? i.sku,
        i.isCanonical === false ? 0 : 1,
        i.aliasOf ?? null,
        i.category,
        i.subcategory ?? null,
        i.family ?? null,
        i.description,
        i.manufacturer ?? null,
        i.brand ?? null,
        i.model ?? null,
        i.modelNumber ?? null,
        i.series ?? null,
        i.imageUrl ?? null,
        i.uom,
        i.baseMaterialCost,
        i.baseLaborMinutes,
        i.laborUnitType ?? null,
        i.laborBasis ?? null,
        i.taxable ? 1 : 0,
        i.adaFlag ? 1 : 0,
        JSON.stringify(i.tags ?? []),
        i.notes ?? null,
        i.active ? 1 : 0,
        i.installLaborFamily ?? null,
        i.defaultMountingType ?? null,
        i.finishGroup ?? null,
        i.attributeGroup ?? null,
        i.duplicateGroupKey ?? null,
        i.deprecated ? 1 : 0,
        i.deprecatedReason ?? null,
        i.recordGranularity ?? null,
        i.materialFamily ?? null,
        i.systemSeries ?? null,
        i.privacyLevel ?? null,
        i.manufacturerConfiguredItem ? 1 : 0,
        i.canonicalMatchAnchor ? 1 : 0,
        i.exactComponentSku ? 1 : 0,
        i.requiresProjectConfiguration ? 1 : 0,
        i.defaultUnit ?? null,
        i.estimatorNotes ?? null,
        req.params.id
      );
    await syncCatalogToGoogleSheetOptional('update item', () =>
      upsertItemInGoogleSheet({
        sku: i.sku,
        category: i.category,
        manufacturer: i.manufacturer ?? null,
        brand: i.brand ?? null,
        model: i.model ?? null,
        modelNumber: i.modelNumber ?? null,
        series: i.series ?? null,
        imageUrl: i.imageUrl ?? null,
        description: i.description,
        unit: i.uom,
        baseMaterialCost: i.baseMaterialCost,
        baseLaborMinutes: i.baseLaborMinutes,
        active: i.active,
      })
    );
    res.json(i);
  } catch (err: unknown) {
    handleRouteError(res, err, '[PUT /api/catalog/items/:id]');
  }
});

legacyRouter.delete('/catalog/items/:id', async (req, res) => {
  try {
    const existing = getEstimatorDb().prepare('SELECT * FROM catalog_items WHERE id = ?').get(req.params.id) as any;
    if (!existing) {
      return res.status(404).json({ error: 'Catalog item not found.' });
    }

    getEstimatorDb().prepare('UPDATE catalog_items SET active = 0 WHERE id = ?').run(req.params.id);
    await syncCatalogToGoogleSheetOptional('deactivate item', () =>
      upsertItemInGoogleSheet({
        sku: existing.sku || existing.id,
        category: existing.category || '',
        manufacturer: existing.manufacturer || null,
        brand: existing.brand || null,
        model: existing.model || null,
        modelNumber: existing.model_number || null,
        series: existing.series || null,
        imageUrl: existing.image_url || null,
        family: existing.family || null,
        subcategory: existing.subcategory || null,
        tags: (() => {
          if (!existing.tags) return [];
          try {
            const parsedTags = JSON.parse(existing.tags);
            return Array.isArray(parsedTags) ? parsedTags : [];
          } catch {
            return [];
          }
        })(),
        description: existing.description || existing.sku || existing.id,
        unit: existing.uom || 'EA',
        baseMaterialCost: Number(existing.base_material_cost || 0),
        baseLaborMinutes: Number(existing.base_labor_minutes || 0),
        active: false,
      })
    );
    res.status(204).send();
  } catch (err: unknown) {
    handleRouteError(res, err, '[DELETE /api/catalog/items/:id]');
  }
});

legacyRouter.get('/catalog/modifiers', (_req, res) => {
  const rows = getEstimatorDb().prepare('SELECT * FROM modifiers_v1 ORDER BY name').all() as any[];
  res.json(
    rows.map((row) => ({
      id: row.id,
      name: row.name,
      modifierKey: row.modifier_key,
      description: row.description != null ? String(row.description) : '',
      appliesToCategories: JSON.parse(row.applies_to_categories || '[]'),
      addLaborMinutes: Number(row.add_labor_minutes || 0),
      addMaterialCost: Number(row.add_material_cost || 0),
      percentLabor: Number(row.percent_labor || 0),
      percentMaterial: Number(row.percent_material || 0),
      active: !!row.active,
      updatedAt: row.updated_at,
    }))
  );
});

legacyRouter.put('/catalog/modifiers/:id', async (req, res) => {
  const existing = getEstimatorDb().prepare('SELECT * FROM modifiers_v1 WHERE id = ?').get(req.params.id) as any;
  if (!existing) return res.status(404).json({ error: 'Modifier not found.' });

  const parsed = legacyModifierUpdateSchema.safeParse(req.body);
  if (!parsed.success) return handleRouteError(res, parsed.error, '[PUT /api/catalog/modifiers/:id]');
  const input = parsed.data;
  const now = new Date().toISOString();
  const record = {
    id: existing.id,
    name: String((input.name ?? existing.name) || '').trim(),
    modifierKey: String((input.modifierKey ?? existing.modifier_key) || '')
      .trim()
      .toUpperCase()
      .replace(/\s+/g, '_'),
    appliesToCategories: input.appliesToCategories ?? JSON.parse(existing.applies_to_categories || '[]'),
    addLaborMinutes: input.addLaborMinutes ?? Number(existing.add_labor_minutes ?? 0),
    addMaterialCost: input.addMaterialCost ?? Number(existing.add_material_cost ?? 0),
    percentLabor: input.percentLabor ?? Number(existing.percent_labor ?? 0),
    percentMaterial: input.percentMaterial ?? Number(existing.percent_material ?? 0),
    active: input.active === undefined ? !!existing.active : !!input.active,
    updatedAt: now,
  };

  try {
    getEstimatorDb()
      .prepare(
        `UPDATE modifiers_v1
        SET name = ?, modifier_key = ?, applies_to_categories = ?, add_labor_minutes = ?, add_material_cost = ?,
            percent_labor = ?, percent_material = ?, active = ?, updated_at = ?
        WHERE id = ?`
      )
      .run(
        record.name,
        record.modifierKey,
        JSON.stringify(record.appliesToCategories),
        record.addLaborMinutes,
        record.addMaterialCost,
        record.percentLabor,
        record.percentMaterial,
        record.active ? 1 : 0,
        record.updatedAt,
        record.id
      );
    await syncCatalogToGoogleSheetOptional('update modifier', () =>
      upsertModifierInGoogleSheet({
        ...record,
        description: existing.description != null ? String(existing.description) : '',
      })
    );
    res.json(record);
  } catch (err: unknown) {
    handleRouteError(res, err, '[PUT /api/catalog/modifiers/:id]');
  }
});

legacyRouter.delete('/catalog/modifiers/:id', async (req, res) => {
  const existing = getEstimatorDb().prepare('SELECT * FROM modifiers_v1 WHERE id = ?').get(req.params.id) as any;
  if (!existing) return res.status(404).json({ error: 'Modifier not found.' });

  try {
    getEstimatorDb()
      .prepare('UPDATE modifiers_v1 SET active = 0, updated_at = ? WHERE id = ?')
      .run(new Date().toISOString(), req.params.id);
    await syncCatalogToGoogleSheetOptional('deactivate modifier', () =>
      upsertModifierInGoogleSheet({
        modifierKey: existing.modifier_key,
        name: existing.name,
        description: existing.description != null ? String(existing.description) : '',
        appliesToCategories: JSON.parse(existing.applies_to_categories || '[]'),
        addLaborMinutes: Number(existing.add_labor_minutes || 0),
        addMaterialCost: Number(existing.add_material_cost || 0),
        percentLabor: Number(existing.percent_labor || 0),
        percentMaterial: Number(existing.percent_material || 0),
        active: false,
      })
    );
    res.status(204).send();
  } catch (err: unknown) {
    handleRouteError(res, err, '[DELETE /api/catalog/modifiers/:id]');
  }
});

legacyRouter.get('/catalog/bundles', (_req, res) => {
  const rows = getEstimatorDb().prepare('SELECT * FROM bundles_v1 ORDER BY bundle_name').all() as any[];
  res.json(
    rows.map((row) => ({
      id: row.id,
      bundleName: row.bundle_name,
      category: row.category,
      active: !!row.active,
      updatedAt: row.updated_at,
    }))
  );
});

legacyRouter.put('/catalog/bundles/:id', async (req, res) => {
  const existing = getEstimatorDb().prepare('SELECT * FROM bundles_v1 WHERE id = ?').get(req.params.id) as any;
  if (!existing) return res.status(404).json({ error: 'Bundle not found.' });

  const parsed = legacyBundleUpdateSchema.safeParse(req.body);
  if (!parsed.success) return handleRouteError(res, parsed.error, '[PUT /api/catalog/bundles/:id]');
  const input = parsed.data;
  const now = new Date().toISOString();
  const bundleItems = getEstimatorDb()
    .prepare('SELECT sku FROM bundle_items_v1 WHERE bundle_id = ? ORDER BY sort_order, id')
    .all(req.params.id) as Array<{ sku: string | null }>;
  const record = {
    bundleId: existing.id,
    bundleName: String((input.bundleName ?? existing.bundle_name) || '').trim(),
    category: (input.category ?? existing.category ?? null) as string | null,
    includedSkus: bundleItems.map((row) => row.sku || '').filter(Boolean),
    includedModifiers: [] as string[],
    active: input.active === undefined ? !!existing.active : !!input.active,
  };

  try {
    getEstimatorDb()
      .prepare('UPDATE bundles_v1 SET bundle_name = ?, category = ?, active = ?, updated_at = ? WHERE id = ?')
      .run(record.bundleName, record.category, record.active ? 1 : 0, now, record.bundleId);
    await syncCatalogToGoogleSheetOptional('update bundle', () => upsertBundleInGoogleSheet(record));
    res.json({ ...record, updatedAt: now });
  } catch (err: unknown) {
    handleRouteError(res, err, '[PUT /api/catalog/bundles/:id]');
  }
});

legacyRouter.delete('/catalog/bundles/:id', async (req, res) => {
  const existing = getEstimatorDb().prepare('SELECT * FROM bundles_v1 WHERE id = ?').get(req.params.id) as any;
  if (!existing) return res.status(404).json({ error: 'Bundle not found.' });

  const bundleItems = getEstimatorDb()
    .prepare('SELECT sku FROM bundle_items_v1 WHERE bundle_id = ? ORDER BY sort_order, id')
    .all(req.params.id) as Array<{ sku: string | null }>;
  try {
    getEstimatorDb()
      .prepare('UPDATE bundles_v1 SET active = 0, updated_at = ? WHERE id = ?')
      .run(new Date().toISOString(), req.params.id);
    await syncCatalogToGoogleSheetOptional('deactivate bundle', () =>
      upsertBundleInGoogleSheet({
        bundleId: existing.id,
        bundleName: existing.bundle_name,
        category: existing.category,
        includedSkus: bundleItems.map((row) => row.sku || '').filter(Boolean),
        includedModifiers: [],
        active: false,
      })
    );
    res.status(204).send();
  } catch (err: unknown) {
    handleRouteError(res, err, '[DELETE /api/catalog/bundles/:id]');
  }
});
