import { randomUUID } from 'crypto';
import { dbAll, dbGet, dbRun } from '../db/query.ts';
import { BundleItemRecord, BundleRecord, TakeoffLineRecord } from '../../shared/types/estimator.ts';
import { createTakeoffLine, resolveUnitLaborCostFromMinutes } from './takeoffRepo.ts';

function mapBundle(row: any): BundleRecord {
  return {
    id: row.id,
    bundleName: row.bundle_name,
    category: row.category,
    active: !!row.active,
    updatedAt: row.updated_at,
  };
}

function mapBundleItem(row: any): BundleItemRecord {
  return {
    id: row.id,
    bundleId: row.bundle_id,
    catalogItemId: row.catalog_item_id,
    sku: row.sku,
    description: row.description,
    qty: row.qty,
    materialCost: row.material_cost,
    laborMinutes: row.labor_minutes,
    laborCost: row.labor_cost,
    sortOrder: row.sort_order,
    notes: row.notes,
  };
}

export async function listBundles(): Promise<BundleRecord[]> {
  const rows = await dbAll('SELECT * FROM bundles_v1 WHERE active = 1 ORDER BY bundle_name');
  return rows.map(mapBundle);
}

export async function getBundle(bundleId: string): Promise<BundleRecord | null> {
  const row = await dbGet('SELECT * FROM bundles_v1 WHERE id = ?', [bundleId]);
  return row ? mapBundle(row) : null;
}

export async function listBundleItems(bundleId: string): Promise<BundleItemRecord[]> {
  const rows = await dbAll('SELECT * FROM bundle_items_v1 WHERE bundle_id = ? ORDER BY sort_order, id', [bundleId]);
  return rows.map(mapBundleItem);
}

export async function createBundle(input: {
  bundleName: string;
  category?: string | null;
  items?: Array<Partial<BundleItemRecord>>;
}): Promise<{ bundle: BundleRecord; items: BundleItemRecord[] }> {
  const now = new Date().toISOString();
  const bundle: BundleRecord = {
    id: randomUUID(),
    bundleName: input.bundleName,
    category: input.category ?? null,
    active: true,
    updatedAt: now,
  };

  await dbRun('INSERT INTO bundles_v1 (id, bundle_name, category, active, updated_at) VALUES (?, ?, ?, ?, ?)', [
    bundle.id,
    bundle.bundleName,
    bundle.category,
    1,
    bundle.updatedAt,
  ]);

  const items: BundleItemRecord[] = [];
  for (let index = 0; index < (input.items ?? []).length; index++) {
    const item = (input.items ?? [])[index]!;
    const nextItem: BundleItemRecord = {
      id: randomUUID(),
      bundleId: bundle.id,
      catalogItemId: item.catalogItemId ?? null,
      sku: item.sku ?? null,
      description: item.description ?? 'Bundle item',
      qty: item.qty ?? 1,
      materialCost: item.materialCost ?? 0,
      laborMinutes: item.laborMinutes ?? 0,
      laborCost: item.laborCost ?? 0,
      sortOrder: item.sortOrder ?? index,
      notes: item.notes ?? null,
    };

    await dbRun(
      `
      INSERT INTO bundle_items_v1 (
        id, bundle_id, catalog_item_id, sku, description, qty, material_cost, labor_minutes, labor_cost, sort_order, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
      [
        nextItem.id,
        nextItem.bundleId,
        nextItem.catalogItemId,
        nextItem.sku,
        nextItem.description,
        nextItem.qty,
        nextItem.materialCost,
        nextItem.laborMinutes,
        nextItem.laborCost,
        nextItem.sortOrder,
        nextItem.notes,
      ]
    );

    items.push(nextItem);
  }

  return { bundle, items };
}

export async function applyBundleToRoom(input: {
  bundleId: string;
  projectId: string;
  roomId: string;
}): Promise<TakeoffLineRecord[] | null> {
  const bundle = await getBundle(input.bundleId);
  if (!bundle) return null;

  const items = await listBundleItems(input.bundleId);

  return Promise.all(
    items.map((item) =>
      createTakeoffLine({
        projectId: input.projectId,
        roomId: input.roomId,
        sourceType: 'bundle',
        sourceRef: bundle.id,
        description: item.description,
        sku: item.sku,
        qty: item.qty,
        unit: 'EA',
        materialCost: item.materialCost,
        laborMinutes: item.laborMinutes,
        laborCost: item.laborCost || resolveUnitLaborCostFromMinutes(item.laborMinutes || 0),
        bundleId: bundle.id,
        catalogItemId: item.catalogItemId,
        notes: item.notes,
      })
    )
  );
}
