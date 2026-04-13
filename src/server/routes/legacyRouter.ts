import { Router } from 'express';
import { randomUUID } from 'crypto';
import { calculateEstimate } from '../engine.ts';
import type { CatalogItem, Project } from '../../types.ts';
import {
  syncCatalogFromGoogleSheets,
  upsertBundleInGoogleSheet,
  upsertItemInGoogleSheet,
  upsertModifierInGoogleSheet,
} from '../services/googleSheetsCatalogSync.ts';
import { getEstimatorDb } from '../db/connection.ts';
import { listCatalogItemsForApi } from '../repos/catalogRepo.ts';
import { handleRouteError } from '../http/jsonErrors.ts';
import {
  legacyBundleUpdateSchema,
  legacyCatalogItemBodySchema,
  legacyModifierCreateSchema,
  legacyModifierUpdateSchema,
  legacyProjectBodySchema,
  legacySettingsBodySchema,
} from '../validation/legacySchemas.ts';

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

legacyRouter.get('/projects', (_req, res) => {
  const projects = getEstimatorDb().prepare('SELECT * FROM projects ORDER BY created_date DESC').all();
  res.json(
    (projects as any[]).map((p) => ({
      id: p.id,
      projectNumber: p.project_number,
      name: p.name,
      clientName: p.client_name,
      gcName: p.gc_name,
      address: p.address,
      bidDate: p.bid_date,
      dueDate: p.due_date,
      projectType: p.project_type,
      estimator: p.estimator,
      status: p.status,
      createdDate: p.created_date,
      settings: JSON.parse(p.settings),
      proposalSettings: JSON.parse(p.proposal_settings),
      scopes: JSON.parse(p.scopes),
      rooms: JSON.parse(p.rooms),
      bundles: JSON.parse(p.bundles),
      alternates: JSON.parse(p.alternates),
      lines: JSON.parse(p.lines),
    }))
  );
});

legacyRouter.get('/projects/:id', (req, res) => {
  const p: any = getEstimatorDb().prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
  if (!p) return res.status(404).json({ error: 'Project not found' });
  res.json({
    id: p.id,
    projectNumber: p.project_number,
    name: p.name,
    clientName: p.client_name,
    gcName: p.gc_name,
    address: p.address,
    bidDate: p.bid_date,
    dueDate: p.due_date,
    projectType: p.project_type,
    estimator: p.estimator,
    status: p.status,
    createdDate: p.created_date,
    settings: JSON.parse(p.settings),
    proposalSettings: JSON.parse(p.proposal_settings),
    scopes: JSON.parse(p.scopes),
    rooms: JSON.parse(p.rooms),
    bundles: JSON.parse(p.bundles),
    alternates: JSON.parse(p.alternates),
    lines: JSON.parse(p.lines),
  });
});

legacyRouter.post('/projects', (req, res) => {
  const parsed = legacyProjectBodySchema.safeParse(req.body);
  if (!parsed.success) return handleRouteError(res, parsed.error, '[POST /api/projects]');
  const p = parsed.data;
  getEstimatorDb()
    .prepare(
      `INSERT INTO projects (id, project_number, name, client_name, gc_name, address, bid_date, due_date, project_type, estimator, status, created_date, settings, proposal_settings, scopes, rooms, bundles, alternates, lines)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      p.id,
      p.projectNumber ?? null,
      p.name,
      p.clientName,
      p.gcName ?? null,
      p.address,
      p.bidDate ?? null,
      p.dueDate ?? null,
      p.projectType ?? null,
      p.estimator ?? null,
      p.status,
      p.createdDate,
      JSON.stringify(p.settings),
      JSON.stringify(p.proposalSettings),
      JSON.stringify(p.scopes),
      JSON.stringify(p.rooms),
      JSON.stringify(p.bundles),
      JSON.stringify(p.alternates),
      JSON.stringify(p.lines)
    );
  res.status(201).json(p as unknown as Project);
});

legacyRouter.put('/projects/:id', (req, res) => {
  const parsed = legacyProjectBodySchema.safeParse(req.body);
  if (!parsed.success) return handleRouteError(res, parsed.error, '[PUT /api/projects/:id]');
  const p = parsed.data;
  getEstimatorDb()
    .prepare(
      `UPDATE projects SET 
        project_number = ?, name = ?, client_name = ?, gc_name = ?, address = ?, bid_date = ?, due_date = ?, project_type = ?, estimator = ?, status = ?, 
        settings = ?, proposal_settings = ?, scopes = ?, rooms = ?, bundles = ?, alternates = ?, lines = ?
      WHERE id = ?`
    )
    .run(
      p.projectNumber ?? null,
      p.name,
      p.clientName,
      p.gcName ?? null,
      p.address,
      p.bidDate ?? null,
      p.dueDate ?? null,
      p.projectType ?? null,
      p.estimator ?? null,
      p.status,
      JSON.stringify(p.settings),
      JSON.stringify(p.proposalSettings),
      JSON.stringify(p.scopes),
      JSON.stringify(p.rooms),
      JSON.stringify(p.bundles),
      JSON.stringify(p.alternates),
      JSON.stringify(p.lines),
      req.params.id
    );
  res.json(p as unknown as Project);
});

legacyRouter.delete('/projects/:id', (req, res) => {
  getEstimatorDb().prepare('DELETE FROM projects WHERE id = ?').run(req.params.id);
  res.status(204).send();
});

legacyRouter.get('/catalog/items', (req, res) => {
  const includeInactive = req.query.includeInactive === '1' || req.query.includeInactive === 'true';
  res.json(listCatalogItemsForApi(includeInactive));
});

legacyRouter.post('/catalog/items', async (req, res) => {
  const parsed = legacyCatalogItemBodySchema.safeParse(req.body);
  if (!parsed.success) return handleRouteError(res, parsed.error, '[POST /api/catalog/items]');
  const i = parsed.data as CatalogItem;
  try {
    getEstimatorDb()
      .prepare(
        `INSERT INTO catalog_items (id, sku, category, subcategory, family, description, manufacturer, brand, model, model_number, series, image_url, uom, base_material_cost, base_labor_minutes, labor_unit_type, taxable, ada_flag, tags, notes, active)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        i.id,
        i.sku,
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
        i.taxable ? 1 : 0,
        i.adaFlag ? 1 : 0,
        JSON.stringify(i.tags ?? []),
        i.notes ?? null,
        i.active ? 1 : 0
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
          sku = ?, category = ?, subcategory = ?, family = ?, description = ?, manufacturer = ?, brand = ?, model = ?, model_number = ?, series = ?, image_url = ?, uom = ?, 
          base_material_cost = ?, base_labor_minutes = ?, labor_unit_type = ?, taxable = ?, ada_flag = ?, tags = ?, notes = ?, active = ?
        WHERE id = ?`
      )
      .run(
        i.sku,
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
        i.taxable ? 1 : 0,
        i.adaFlag ? 1 : 0,
        JSON.stringify(i.tags ?? []),
        i.notes ?? null,
        i.active ? 1 : 0,
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

legacyRouter.post('/catalog/modifiers', async (req, res) => {
  const parsed = legacyModifierCreateSchema.safeParse(req.body);
  if (!parsed.success) return handleRouteError(res, parsed.error, '[POST /api/catalog/modifiers]');
  const input = parsed.data;
  const now = new Date().toISOString();
  const record = {
    id: input.id || randomUUID(),
    name: input.name.trim(),
    modifierKey: (input.modifierKey || input.name).trim().toUpperCase().replace(/\s+/g, '_'),
    description: String(input.description ?? '').trim(),
    appliesToCategories: input.appliesToCategories ?? [],
    addLaborMinutes: input.addLaborMinutes ?? 0,
    addMaterialCost: input.addMaterialCost ?? 0,
    percentLabor: input.percentLabor ?? 0,
    percentMaterial: input.percentMaterial ?? 0,
    active: input.active !== false,
    updatedAt: now,
  };

  try {
    getEstimatorDb()
      .prepare(
        `INSERT INTO modifiers_v1 (
          id, name, modifier_key, description, applies_to_categories, add_labor_minutes, add_material_cost,
          percent_labor, percent_material, active, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        record.id,
        record.name,
        record.modifierKey,
        record.description,
        JSON.stringify(record.appliesToCategories),
        record.addLaborMinutes,
        record.addMaterialCost,
        record.percentLabor,
        record.percentMaterial,
        record.active ? 1 : 0,
        record.updatedAt
      );
    await syncCatalogToGoogleSheetOptional('create modifier', () => upsertModifierInGoogleSheet(record));
    res.status(201).json(record);
  } catch (err: unknown) {
    handleRouteError(res, err, '[POST /api/catalog/modifiers]');
  }
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

legacyRouter.get('/global/bundles', (_req, res) => {
  const bundles = getEstimatorDb().prepare('SELECT * FROM global_bundles').all();
  res.json(
    (bundles as any[]).map((b) => ({
      id: b.id,
      name: b.name,
      items: JSON.parse(b.items),
    }))
  );
});

legacyRouter.get('/global/addins', (_req, res) => {
  const addins = getEstimatorDb().prepare('SELECT * FROM global_addins').all();
  res.json(
    (addins as any[]).map((a) => ({
      id: a.id,
      name: a.name,
      cost: a.cost,
      laborMinutes: a.labor_minutes,
    }))
  );
});

legacyRouter.post('/sync/sheets', async (_req, res) => {
  try {
    const result = await syncCatalogFromGoogleSheets();
    res.json(result);
  } catch (err: unknown) {
    handleRouteError(res, err, '[POST /api/sync/sheets]');
  }
});

legacyRouter.post('/estimate/calculate', (req, res) => {
  const parsed = legacyProjectBodySchema.safeParse(req.body);
  if (!parsed.success) return handleRouteError(res, parsed.error, '[POST /api/estimate/calculate]');
  const project = parsed.data as unknown as Project;
  const catalog = getEstimatorDb()
    .prepare('SELECT * FROM catalog_items')
    .all()
    .map((i: any) => ({
      ...i,
      baseMaterialCost: i.base_material_cost,
      baseLaborMinutes: i.base_labor_minutes,
      laborUnitType: i.labor_unit_type,
      modelNumber: i.model_number,
      taxable: !!i.taxable,
      adaFlag: !!i.ada_flag,
      tags: i.tags ? JSON.parse(i.tags) : [],
    }));
  const result = calculateEstimate(project, catalog);
  res.json(result);
});

legacyRouter.get('/settings', (_req, res) => {
  const s: any = getEstimatorDb().prepare('SELECT value FROM settings WHERE key = ?').get('global');
  res.json(JSON.parse(s.value));
});

legacyRouter.put('/settings', (req, res) => {
  const parsed = legacySettingsBodySchema.safeParse(req.body);
  if (!parsed.success) return handleRouteError(res, parsed.error, '[PUT /api/settings]');
  getEstimatorDb().prepare('UPDATE settings SET value = ? WHERE key = ?').run(JSON.stringify(parsed.data), 'global');
  res.json(parsed.data);
});
