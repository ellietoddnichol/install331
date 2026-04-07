
import fs from 'fs';
import dotenv from 'dotenv';
import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import { randomUUID } from 'crypto';
import { calculateEstimate } from "./src/server/engine.ts";
import { Project, CatalogItem } from "./src/types.ts";
import {
  syncCatalogFromGoogleSheets,
  upsertBundleInGoogleSheet,
  upsertItemInGoogleSheet,
  upsertModifierInGoogleSheet,
} from "./src/server/services/googleSheetsCatalogSync.ts";
import { getEstimatorDb } from "./src/server/db/connection.ts";
import { listCatalogItemsForApi } from "./src/server/repos/catalogRepo.ts";
import { v1Router } from "./src/server/routes/v1/index.ts";

/** SQLite is the app source of truth; Google Sheets sync is best-effort and must not block saves. */
async function syncCatalogToGoogleSheetOptional(label: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[catalog] Google Sheets sync skipped (${label}): ${message}`);
  }
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load environment variables from common files in precedence order.
['.env', '.env.local'].forEach((fileName) => {
  const fullPath = path.join(__dirname, fileName);
  if (fs.existsSync(fullPath)) {
    dotenv.config({ path: fullPath, override: false });
  }
});

// Fallback to .env.example for any missing or blank values.
const envExamplePath = path.join(__dirname, '.env.example');
if (fs.existsSync(envExamplePath)) {
  const parsed = dotenv.parse(fs.readFileSync(envExamplePath));
  Object.entries(parsed).forEach(([key, value]) => {
    const current = process.env[key];
    if (!current || !current.trim()) {
      process.env[key] = value;
    }
  });
}

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT || 3000);

  app.use(express.json({ limit: '12mb' }));

  // New normalized API surface for ongoing rebuild.
  app.use("/api/v1", v1Router);

  // --- API Routes ---

  // Health
  app.get("/api/health", (req, res) => res.json({ status: "ok" }));

  // Projects
  app.get("/api/projects", (req, res) => {
    const projects = getEstimatorDb().prepare('SELECT * FROM projects ORDER BY created_date DESC').all();
    res.json(projects.map((p: any) => ({
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
      lines: JSON.parse(p.lines)
    })));
  });

  app.get("/api/projects/:id", (req, res) => {
    const p: any = getEstimatorDb().prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
    if (!p) return res.status(404).json({ error: "Project not found" });
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
      lines: JSON.parse(p.lines)
    });
  });

  app.post("/api/projects", (req, res) => {
    const p: Project = req.body;
    getEstimatorDb().prepare(`
      INSERT INTO projects (id, project_number, name, client_name, gc_name, address, bid_date, due_date, project_type, estimator, status, created_date, settings, proposal_settings, scopes, rooms, bundles, alternates, lines)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      p.id, p.projectNumber || null, p.name, p.clientName, p.gcName || null, p.address, p.bidDate || null, p.dueDate || null, p.projectType || null, p.estimator || null, p.status, p.createdDate,
      JSON.stringify(p.settings), JSON.stringify(p.proposalSettings), JSON.stringify(p.scopes), JSON.stringify(p.rooms),
      JSON.stringify(p.bundles), JSON.stringify(p.alternates), JSON.stringify(p.lines)
    );
    res.status(201).json(p);
  });

  app.put("/api/projects/:id", (req, res) => {
    const p: Project = req.body;
    getEstimatorDb().prepare(`
      UPDATE projects SET 
        project_number = ?, name = ?, client_name = ?, gc_name = ?, address = ?, bid_date = ?, due_date = ?, project_type = ?, estimator = ?, status = ?, 
        settings = ?, proposal_settings = ?, scopes = ?, rooms = ?, bundles = ?, alternates = ?, lines = ?
      WHERE id = ?
    `).run(
      p.projectNumber || null, p.name, p.clientName, p.gcName || null, p.address, p.bidDate || null, p.dueDate || null, p.projectType || null, p.estimator || null, p.status,
      JSON.stringify(p.settings), JSON.stringify(p.proposalSettings), JSON.stringify(p.scopes), JSON.stringify(p.rooms),
      JSON.stringify(p.bundles), JSON.stringify(p.alternates), JSON.stringify(p.lines),
      req.params.id
    );
    res.json(p);
  });

  app.delete("/api/projects/:id", (req, res) => {
    getEstimatorDb().prepare('DELETE FROM projects WHERE id = ?').run(req.params.id);
    res.status(204).send();
  });

  // Catalog
  app.get("/api/catalog/items", (req, res) => {
    const includeInactive =
      req.query.includeInactive === "1" ||
      req.query.includeInactive === "true";
    const items = listCatalogItemsForApi(includeInactive);
    res.json(items);
  });

  app.post("/api/catalog/items", async (req, res) => {
    const i: CatalogItem = req.body;
    try {
      getEstimatorDb().prepare(`
        INSERT INTO catalog_items (id, sku, category, subcategory, family, description, manufacturer, brand, model, model_number, series, image_url, uom, base_material_cost, base_labor_minutes, labor_unit_type, taxable, ada_flag, tags, notes, active)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        i.id, i.sku, i.category, i.subcategory || null, i.family || null, i.description, i.manufacturer || null, i.brand || null, i.model || null, i.modelNumber || null, i.series || null, i.imageUrl || null, i.uom,
        i.baseMaterialCost, i.baseLaborMinutes, i.laborUnitType || null, i.taxable ? 1 : 0, i.adaFlag ? 1 : 0, JSON.stringify(i.tags || []), i.notes || null, i.active ? 1 : 0
      );
      await syncCatalogToGoogleSheetOptional('create item', () =>
        upsertItemInGoogleSheet({
          sku: i.sku,
          category: i.category,
          manufacturer: i.manufacturer || null,
          brand: i.brand || null,
          model: i.model || null,
          modelNumber: i.modelNumber || null,
          series: i.series || null,
          imageUrl: i.imageUrl || null,
          family: i.family || null,
          subcategory: i.subcategory || null,
          tags: i.tags || [],
          description: i.description,
          unit: i.uom,
          baseMaterialCost: i.baseMaterialCost,
          baseLaborMinutes: i.baseLaborMinutes,
          active: i.active,
        })
      );
      res.status(201).json(i);
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to create catalog item.' });
    }
  });

  app.put("/api/catalog/items/:id", async (req, res) => {
    const i: CatalogItem = req.body;
    try {
      getEstimatorDb().prepare(`
        UPDATE catalog_items SET 
          sku = ?, category = ?, subcategory = ?, family = ?, description = ?, manufacturer = ?, brand = ?, model = ?, model_number = ?, series = ?, image_url = ?, uom = ?, 
          base_material_cost = ?, base_labor_minutes = ?, labor_unit_type = ?, taxable = ?, ada_flag = ?, tags = ?, notes = ?, active = ?
        WHERE id = ?
      `).run(
        i.sku, i.category, i.subcategory || null, i.family || null, i.description, i.manufacturer || null, i.brand || null, i.model || null, i.modelNumber || null, i.series || null, i.imageUrl || null, i.uom,
        i.baseMaterialCost, i.baseLaborMinutes, i.laborUnitType || null, i.taxable ? 1 : 0, i.adaFlag ? 1 : 0, JSON.stringify(i.tags || []), i.notes || null, i.active ? 1 : 0,
        req.params.id
      );
      await syncCatalogToGoogleSheetOptional('update item', () =>
        upsertItemInGoogleSheet({
          sku: i.sku,
          category: i.category,
          manufacturer: i.manufacturer || null,
          brand: i.brand || null,
          model: i.model || null,
          modelNumber: i.modelNumber || null,
          series: i.series || null,
          imageUrl: i.imageUrl || null,
          description: i.description,
          unit: i.uom,
          baseMaterialCost: i.baseMaterialCost,
          baseLaborMinutes: i.baseLaborMinutes,
          active: i.active,
        })
      );
      res.json(i);
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to update catalog item.' });
    }
  });

  app.delete("/api/catalog/items/:id", async (req, res) => {
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
              const parsed = JSON.parse(existing.tags);
              return Array.isArray(parsed) ? parsed : [];
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
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to deactivate catalog item.' });
    }
  });

  app.get('/api/catalog/modifiers', (_req, res) => {
    const rows = getEstimatorDb().prepare('SELECT * FROM modifiers_v1 ORDER BY name').all() as any[];
    res.json(rows.map((row) => ({
      id: row.id,
      name: row.name,
      modifierKey: row.modifier_key,
      appliesToCategories: JSON.parse(row.applies_to_categories || '[]'),
      addLaborMinutes: Number(row.add_labor_minutes || 0),
      addMaterialCost: Number(row.add_material_cost || 0),
      percentLabor: Number(row.percent_labor || 0),
      percentMaterial: Number(row.percent_material || 0),
      active: !!row.active,
      updatedAt: row.updated_at,
    })));
  });

  app.post('/api/catalog/modifiers', async (req, res) => {
    const input = req.body || {};
    const now = new Date().toISOString();
    const record = {
      id: input.id || randomUUID(),
      name: String(input.name || '').trim(),
      modifierKey: String(input.modifierKey || input.name || '').trim().toUpperCase().replace(/\s+/g, '_'),
      appliesToCategories: Array.isArray(input.appliesToCategories) ? input.appliesToCategories : [],
      addLaborMinutes: Number(input.addLaborMinutes || 0),
      addMaterialCost: Number(input.addMaterialCost || 0),
      percentLabor: Number(input.percentLabor || 0),
      percentMaterial: Number(input.percentMaterial || 0),
      active: input.active !== false,
      updatedAt: now,
    };

    try {
      getEstimatorDb().prepare(`
        INSERT INTO modifiers_v1 (
          id, name, modifier_key, applies_to_categories, add_labor_minutes, add_material_cost,
          percent_labor, percent_material, active, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        record.id,
        record.name,
        record.modifierKey,
        JSON.stringify(record.appliesToCategories),
        record.addLaborMinutes,
        record.addMaterialCost,
        record.percentLabor,
        record.percentMaterial,
        record.active ? 1 : 0,
        record.updatedAt,
      );
      await syncCatalogToGoogleSheetOptional('create modifier', () => upsertModifierInGoogleSheet(record));
      res.status(201).json(record);
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to create modifier.' });
    }
  });

  app.put('/api/catalog/modifiers/:id', async (req, res) => {
    const existing = getEstimatorDb().prepare('SELECT * FROM modifiers_v1 WHERE id = ?').get(req.params.id) as any;
    if (!existing) return res.status(404).json({ error: 'Modifier not found.' });

    const input = req.body || {};
    const now = new Date().toISOString();
    const record = {
      id: existing.id,
      name: String((input.name ?? existing.name) || '').trim(),
      modifierKey: String((input.modifierKey ?? existing.modifier_key) || '').trim().toUpperCase().replace(/\s+/g, '_'),
      appliesToCategories: Array.isArray(input.appliesToCategories) ? input.appliesToCategories : JSON.parse(existing.applies_to_categories || '[]'),
      addLaborMinutes: Number(input.addLaborMinutes ?? existing.add_labor_minutes ?? 0),
      addMaterialCost: Number(input.addMaterialCost ?? existing.add_material_cost ?? 0),
      percentLabor: Number(input.percentLabor ?? existing.percent_labor ?? 0),
      percentMaterial: Number(input.percentMaterial ?? existing.percent_material ?? 0),
      active: input.active === undefined ? !!existing.active : !!input.active,
      updatedAt: now,
    };

    try {
      getEstimatorDb().prepare(`
        UPDATE modifiers_v1
        SET name = ?, modifier_key = ?, applies_to_categories = ?, add_labor_minutes = ?, add_material_cost = ?,
            percent_labor = ?, percent_material = ?, active = ?, updated_at = ?
        WHERE id = ?
      `).run(
        record.name,
        record.modifierKey,
        JSON.stringify(record.appliesToCategories),
        record.addLaborMinutes,
        record.addMaterialCost,
        record.percentLabor,
        record.percentMaterial,
        record.active ? 1 : 0,
        record.updatedAt,
        record.id,
      );
      await syncCatalogToGoogleSheetOptional('update modifier', () => upsertModifierInGoogleSheet(record));
      res.json(record);
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to update modifier.' });
    }
  });

  app.delete('/api/catalog/modifiers/:id', async (req, res) => {
    const existing = getEstimatorDb().prepare('SELECT * FROM modifiers_v1 WHERE id = ?').get(req.params.id) as any;
    if (!existing) return res.status(404).json({ error: 'Modifier not found.' });

    try {
      getEstimatorDb().prepare('UPDATE modifiers_v1 SET active = 0, updated_at = ? WHERE id = ?').run(new Date().toISOString(), req.params.id);
      await syncCatalogToGoogleSheetOptional('deactivate modifier', () =>
        upsertModifierInGoogleSheet({
          modifierKey: existing.modifier_key,
          name: existing.name,
          appliesToCategories: JSON.parse(existing.applies_to_categories || '[]'),
          addLaborMinutes: Number(existing.add_labor_minutes || 0),
          addMaterialCost: Number(existing.add_material_cost || 0),
          percentLabor: Number(existing.percent_labor || 0),
          percentMaterial: Number(existing.percent_material || 0),
          active: false,
        })
      );
      res.status(204).send();
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to deactivate modifier.' });
    }
  });

  app.get('/api/catalog/bundles', (_req, res) => {
    const rows = getEstimatorDb().prepare('SELECT * FROM bundles_v1 ORDER BY bundle_name').all() as any[];
    res.json(rows.map((row) => ({
      id: row.id,
      bundleName: row.bundle_name,
      category: row.category,
      active: !!row.active,
      updatedAt: row.updated_at,
    })));
  });

  app.put('/api/catalog/bundles/:id', async (req, res) => {
    const existing = getEstimatorDb().prepare('SELECT * FROM bundles_v1 WHERE id = ?').get(req.params.id) as any;
    if (!existing) return res.status(404).json({ error: 'Bundle not found.' });

    const input = req.body || {};
    const now = new Date().toISOString();
    const bundleItems = getEstimatorDb().prepare('SELECT sku FROM bundle_items_v1 WHERE bundle_id = ? ORDER BY sort_order, id').all(req.params.id) as Array<{ sku: string | null }>;
    const record = {
      bundleId: existing.id,
      bundleName: String((input.bundleName ?? existing.bundle_name) || '').trim(),
      category: (input.category ?? existing.category ?? null) as string | null,
      includedSkus: bundleItems.map((row) => row.sku || '').filter(Boolean),
      includedModifiers: [] as string[],
      active: input.active === undefined ? !!existing.active : !!input.active,
    };

    try {
      getEstimatorDb().prepare('UPDATE bundles_v1 SET bundle_name = ?, category = ?, active = ?, updated_at = ? WHERE id = ?')
        .run(record.bundleName, record.category, record.active ? 1 : 0, now, record.bundleId);
      await syncCatalogToGoogleSheetOptional('update bundle', () => upsertBundleInGoogleSheet(record));
      res.json({ ...record, updatedAt: now });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to update bundle.' });
    }
  });

  app.delete('/api/catalog/bundles/:id', async (req, res) => {
    const existing = getEstimatorDb().prepare('SELECT * FROM bundles_v1 WHERE id = ?').get(req.params.id) as any;
    if (!existing) return res.status(404).json({ error: 'Bundle not found.' });

    const bundleItems = getEstimatorDb().prepare('SELECT sku FROM bundle_items_v1 WHERE bundle_id = ? ORDER BY sort_order, id').all(req.params.id) as Array<{ sku: string | null }>;
    try {
      getEstimatorDb().prepare('UPDATE bundles_v1 SET active = 0, updated_at = ? WHERE id = ?').run(new Date().toISOString(), req.params.id);
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
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to deactivate bundle.' });
    }
  });

  // Global Bundles
  app.get("/api/global/bundles", (req, res) => {
    const bundles = getEstimatorDb().prepare('SELECT * FROM global_bundles').all();
    res.json(bundles.map((b: any) => ({
      id: b.id,
      name: b.name,
      items: JSON.parse(b.items)
    })));
  });

  // Global AddIns
  app.get("/api/global/addins", (req, res) => {
    const addins = getEstimatorDb().prepare('SELECT * FROM global_addins').all();
    res.json(addins.map((a: any) => ({
      id: a.id,
      name: a.name,
      cost: a.cost,
      laborMinutes: a.labor_minutes
    })));
  });

  app.post("/api/sync/sheets", async (req, res) => {
    try {
      const result = await syncCatalogFromGoogleSheets();
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Estimate
  app.post("/api/estimate/calculate", (req, res) => {
    const project: Project = req.body;
    const catalog = getEstimatorDb().prepare('SELECT * FROM catalog_items').all().map((i: any) => ({
      ...i,
      baseMaterialCost: i.base_material_cost,
      baseLaborMinutes: i.base_labor_minutes,
      laborUnitType: i.labor_unit_type,
      modelNumber: i.model_number,
      taxable: !!i.taxable,
      adaFlag: !!i.ada_flag,
      tags: i.tags ? JSON.parse(i.tags) : []
    }));
    const result = calculateEstimate(project, catalog);
    res.json(result);
  });

  // Settings
  app.get("/api/settings", (req, res) => {
    const s: any = getEstimatorDb().prepare('SELECT value FROM settings WHERE key = ?').get('global');
    res.json(JSON.parse(s.value));
  });

  app.put("/api/settings", (req, res) => {
    getEstimatorDb().prepare('UPDATE settings SET value = ? WHERE key = ?').run(JSON.stringify(req.body), 'global');
    res.json(req.body);
  });

  // 404 for API routes
  app.use("/api/*", (req, res) => {
    res.status(404).json({ error: `API route not found: ${req.originalUrl}` });
  });

  // Error handler
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error(err);
    res.status(500).json({ error: err.message || "Internal Server Error" });
  });

  // --- Vite / Static ---
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => res.sendFile(path.join(__dirname, "dist/index.html")));
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);

    const autoStart = String(process.env.AUTO_SYNC_CATALOG_ON_START || '').trim().toLowerCase();
    if (autoStart === '1' || autoStart === 'true' || autoStart === 'yes') {
      setTimeout(() => {
        syncCatalogFromGoogleSheets().catch((err: unknown) => {
          const message = err instanceof Error ? err.message : String(err);
          console.warn(`[catalog] startup sync failed: ${message}`);
        });
      }, 2500);
    }
  });
}

startServer();
