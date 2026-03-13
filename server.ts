
import fs from 'fs';
import dotenv from 'dotenv';
import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import { randomUUID } from 'crypto';
import db, { initDb } from "./src/server/db.ts";
import { calculateEstimate } from "./src/server/engine.ts";
import { Project, CatalogItem } from "./src/types.ts";
import {
  syncCatalogFromGoogleSheets,
  upsertBundleInGoogleSheet,
  upsertItemInGoogleSheet,
  upsertModifierInGoogleSheet,
} from "./src/server/services/googleSheetsCatalogSync.ts";
import { initEstimatorSchema } from "./src/server/db/schema.ts";
import { v1Router } from "./src/server/routes/v1/index.ts";

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
  initDb();
  initEstimatorSchema();
  
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '12mb' }));

  // New normalized API surface for ongoing rebuild.
  app.use("/api/v1", v1Router);

  // --- API Routes ---

  // Health
  app.get("/api/health", (req, res) => res.json({ status: "ok" }));

  // Projects
  app.get("/api/projects", (req, res) => {
    const projects = db.prepare('SELECT * FROM projects ORDER BY created_date DESC').all();
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
    const p: any = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
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
    db.prepare(`
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
    db.prepare(`
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
    db.prepare('DELETE FROM projects WHERE id = ?').run(req.params.id);
    res.status(204).send();
  });

  // Catalog
  app.get("/api/catalog/items", (req, res) => {
    const items = db.prepare('SELECT * FROM catalog_items WHERE active = 1').all();
    res.json(items.map((i: any) => ({
      ...i,
      baseMaterialCost: i.base_material_cost,
      baseLaborMinutes: i.base_labor_minutes,
      laborUnitType: i.labor_unit_type,
      taxable: !!i.taxable,
      adaFlag: !!i.ada_flag,
      tags: i.tags ? JSON.parse(i.tags) : []
    })));
  });

  app.post("/api/catalog/items", async (req, res) => {
    const i: CatalogItem = req.body;
    try {
      await upsertItemInGoogleSheet({
        sku: i.sku,
        category: i.category,
        manufacturer: i.manufacturer || null,
        model: i.model || null,
        description: i.description,
        unit: i.uom,
        baseMaterialCost: i.baseMaterialCost,
        baseLaborMinutes: i.baseLaborMinutes,
        active: i.active,
      });

      db.prepare(`
        INSERT INTO catalog_items (id, sku, category, subcategory, family, description, manufacturer, model, uom, base_material_cost, base_labor_minutes, labor_unit_type, taxable, ada_flag, tags, notes, active)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        i.id, i.sku, i.category, i.subcategory || null, i.family || null, i.description, i.manufacturer || null, i.model || null, i.uom,
        i.baseMaterialCost, i.baseLaborMinutes, i.laborUnitType || null, i.taxable ? 1 : 0, i.adaFlag ? 1 : 0, JSON.stringify(i.tags || []), i.notes || null, i.active ? 1 : 0
      );
      res.status(201).json(i);
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to create catalog item.' });
    }
  });

  app.put("/api/catalog/items/:id", async (req, res) => {
    const i: CatalogItem = req.body;
    try {
      await upsertItemInGoogleSheet({
        sku: i.sku,
        category: i.category,
        manufacturer: i.manufacturer || null,
        model: i.model || null,
        description: i.description,
        unit: i.uom,
        baseMaterialCost: i.baseMaterialCost,
        baseLaborMinutes: i.baseLaborMinutes,
        active: i.active,
      });

      db.prepare(`
        UPDATE catalog_items SET 
          sku = ?, category = ?, subcategory = ?, family = ?, description = ?, manufacturer = ?, model = ?, uom = ?, 
          base_material_cost = ?, base_labor_minutes = ?, labor_unit_type = ?, taxable = ?, ada_flag = ?, tags = ?, notes = ?, active = ?
        WHERE id = ?
      `).run(
        i.sku, i.category, i.subcategory || null, i.family || null, i.description, i.manufacturer || null, i.model || null, i.uom,
        i.baseMaterialCost, i.baseLaborMinutes, i.laborUnitType || null, i.taxable ? 1 : 0, i.adaFlag ? 1 : 0, JSON.stringify(i.tags || []), i.notes || null, i.active ? 1 : 0,
        req.params.id
      );
      res.json(i);
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to update catalog item.' });
    }
  });

  app.delete("/api/catalog/items/:id", async (req, res) => {
    try {
      const existing = db.prepare('SELECT * FROM catalog_items WHERE id = ?').get(req.params.id) as any;
      if (!existing) {
        return res.status(404).json({ error: 'Catalog item not found.' });
      }

      await upsertItemInGoogleSheet({
        sku: existing.sku || existing.id,
        category: existing.category || '',
        manufacturer: existing.manufacturer || null,
        model: existing.model || null,
        description: existing.description || existing.sku || existing.id,
        unit: existing.uom || 'EA',
        baseMaterialCost: Number(existing.base_material_cost || 0),
        baseLaborMinutes: Number(existing.base_labor_minutes || 0),
        active: false,
      });

      db.prepare('UPDATE catalog_items SET active = 0 WHERE id = ?').run(req.params.id);
      res.status(204).send();
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to deactivate catalog item.' });
    }
  });

  app.get('/api/catalog/modifiers', (_req, res) => {
    const rows = db.prepare('SELECT * FROM modifiers_v1 ORDER BY name').all() as any[];
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
      await upsertModifierInGoogleSheet(record);
      db.prepare(`
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
      res.status(201).json(record);
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to create modifier.' });
    }
  });

  app.put('/api/catalog/modifiers/:id', async (req, res) => {
    const existing = db.prepare('SELECT * FROM modifiers_v1 WHERE id = ?').get(req.params.id) as any;
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
      await upsertModifierInGoogleSheet(record);
      db.prepare(`
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
      res.json(record);
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to update modifier.' });
    }
  });

  app.delete('/api/catalog/modifiers/:id', async (req, res) => {
    const existing = db.prepare('SELECT * FROM modifiers_v1 WHERE id = ?').get(req.params.id) as any;
    if (!existing) return res.status(404).json({ error: 'Modifier not found.' });

    try {
      await upsertModifierInGoogleSheet({
        modifierKey: existing.modifier_key,
        name: existing.name,
        appliesToCategories: JSON.parse(existing.applies_to_categories || '[]'),
        addLaborMinutes: Number(existing.add_labor_minutes || 0),
        addMaterialCost: Number(existing.add_material_cost || 0),
        percentLabor: Number(existing.percent_labor || 0),
        percentMaterial: Number(existing.percent_material || 0),
        active: false,
      });
      db.prepare('UPDATE modifiers_v1 SET active = 0, updated_at = ? WHERE id = ?').run(new Date().toISOString(), req.params.id);
      res.status(204).send();
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to deactivate modifier.' });
    }
  });

  app.get('/api/catalog/bundles', (_req, res) => {
    const rows = db.prepare('SELECT * FROM bundles_v1 ORDER BY bundle_name').all() as any[];
    res.json(rows.map((row) => ({
      id: row.id,
      bundleName: row.bundle_name,
      category: row.category,
      active: !!row.active,
      updatedAt: row.updated_at,
    })));
  });

  app.put('/api/catalog/bundles/:id', async (req, res) => {
    const existing = db.prepare('SELECT * FROM bundles_v1 WHERE id = ?').get(req.params.id) as any;
    if (!existing) return res.status(404).json({ error: 'Bundle not found.' });

    const input = req.body || {};
    const now = new Date().toISOString();
    const bundleItems = db.prepare('SELECT sku FROM bundle_items_v1 WHERE bundle_id = ? ORDER BY sort_order, id').all(req.params.id) as Array<{ sku: string | null }>;
    const record = {
      bundleId: existing.id,
      bundleName: String((input.bundleName ?? existing.bundle_name) || '').trim(),
      category: (input.category ?? existing.category ?? null) as string | null,
      includedSkus: bundleItems.map((row) => row.sku || '').filter(Boolean),
      includedModifiers: [] as string[],
      active: input.active === undefined ? !!existing.active : !!input.active,
    };

    try {
      await upsertBundleInGoogleSheet(record);
      db.prepare('UPDATE bundles_v1 SET bundle_name = ?, category = ?, active = ?, updated_at = ? WHERE id = ?')
        .run(record.bundleName, record.category, record.active ? 1 : 0, now, record.bundleId);
      res.json({ ...record, updatedAt: now });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to update bundle.' });
    }
  });

  app.delete('/api/catalog/bundles/:id', async (req, res) => {
    const existing = db.prepare('SELECT * FROM bundles_v1 WHERE id = ?').get(req.params.id) as any;
    if (!existing) return res.status(404).json({ error: 'Bundle not found.' });

    const bundleItems = db.prepare('SELECT sku FROM bundle_items_v1 WHERE bundle_id = ? ORDER BY sort_order, id').all(req.params.id) as Array<{ sku: string | null }>;
    try {
      await upsertBundleInGoogleSheet({
        bundleId: existing.id,
        bundleName: existing.bundle_name,
        category: existing.category,
        includedSkus: bundleItems.map((row) => row.sku || '').filter(Boolean),
        includedModifiers: [],
        active: false,
      });
      db.prepare('UPDATE bundles_v1 SET active = 0, updated_at = ? WHERE id = ?').run(new Date().toISOString(), req.params.id);
      res.status(204).send();
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to deactivate bundle.' });
    }
  });

  // Global Bundles
  app.get("/api/global/bundles", (req, res) => {
    const bundles = db.prepare('SELECT * FROM global_bundles').all();
    res.json(bundles.map((b: any) => ({
      id: b.id,
      name: b.name,
      items: JSON.parse(b.items)
    })));
  });

  // Global AddIns
  app.get("/api/global/addins", (req, res) => {
    const addins = db.prepare('SELECT * FROM global_addins').all();
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
    const catalog = db.prepare('SELECT * FROM catalog_items').all().map((i: any) => ({
      ...i,
      baseMaterialCost: i.base_material_cost,
      baseLaborMinutes: i.base_labor_minutes,
      laborUnitType: i.labor_unit_type,
      taxable: !!i.taxable,
      adaFlag: !!i.ada_flag,
      tags: i.tags ? JSON.parse(i.tags) : []
    }));
    const result = calculateEstimate(project, catalog);
    res.json(result);
  });

  // Settings
  app.get("/api/settings", (req, res) => {
    const s: any = db.prepare('SELECT value FROM settings WHERE key = ?').get('global');
    res.json(JSON.parse(s.value));
  });

  app.put("/api/settings", (req, res) => {
    db.prepare('UPDATE settings SET value = ? WHERE key = ?').run(JSON.stringify(req.body), 'global');
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
  });
}

startServer();
