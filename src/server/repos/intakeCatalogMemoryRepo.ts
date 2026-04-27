import { createHash } from 'crypto';
import { isPgDriver } from '../db/driver.ts';
import { dbAll, dbGet, dbRun } from '../db/query.ts';

export function intakeLineMemoryKeyFromFields(input: {
  itemCode?: string;
  itemName?: string;
  description?: string;
}): string {
  const raw = [input.itemCode, input.itemName, input.description]
    .map((x) => String(x ?? '').trim().toLowerCase().replace(/\s+/g, ' '))
    .join('\t');
  return createHash('sha256').update(raw || 'empty').digest('hex').slice(0, 48);
}

export async function getIntakeCatalogMemoryCatalogId(memoryKey: string): Promise<string | null> {
  const row = await dbGet<{ catalog_item_id: string }>(
    'SELECT catalog_item_id FROM intake_catalog_memory_v1 WHERE memory_key = ?',
    [memoryKey]
  );
  return row?.catalog_item_id ?? null;
}

/** Single round-trip for many keys (used by intake review-line construction). */
export async function getIntakeCatalogMemoryBatch(memoryKeys: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const uniq = [...new Set(memoryKeys.filter(Boolean))];
  if (!uniq.length) return out;
  const placeholders = uniq.map(() => '?').join(', ');
  const rows = await dbAll<{ memory_key: string; catalog_item_id: string }>(
    `SELECT memory_key, catalog_item_id FROM intake_catalog_memory_v1 WHERE memory_key IN (${placeholders})`,
    uniq
  );
  for (const row of rows) {
    if (row.memory_key && row.catalog_item_id) out.set(row.memory_key, row.catalog_item_id);
  }
  return out;
}

export async function upsertIntakeCatalogMemory(memoryKey: string, catalogItemId: string): Promise<void> {
  const now = new Date().toISOString();
  if (isPgDriver()) {
    await dbRun(
      `
      INSERT INTO intake_catalog_memory_v1 (memory_key, catalog_item_id, hit_count, updated_at)
      VALUES (?, ?, 1, ?)
      ON CONFLICT (memory_key) DO UPDATE SET
        catalog_item_id = EXCLUDED.catalog_item_id,
        hit_count = intake_catalog_memory_v1.hit_count + 1,
        updated_at = EXCLUDED.updated_at
    `,
      [memoryKey, catalogItemId, now]
    );
  } else {
    await dbRun(
      `
      INSERT INTO intake_catalog_memory_v1 (memory_key, catalog_item_id, hit_count, updated_at)
      VALUES (?, ?, 1, ?)
      ON CONFLICT(memory_key) DO UPDATE SET
        catalog_item_id = excluded.catalog_item_id,
        hit_count = hit_count + 1,
        updated_at = excluded.updated_at
    `,
      [memoryKey, catalogItemId, now]
    );
  }
}

/**
 * Persist an estimator-confirmed description/SKU → catalog mapping for future intake matching.
 */
export async function recordIntakeCatalogMemoryFromAcceptedMatch(fields: {
  sku: string | null | undefined;
  description: string | null | undefined;
  catalogItemId: string | null | undefined;
}): Promise<void> {
  const catalogItemId = String(fields.catalogItemId ?? '').trim();
  if (!catalogItemId) return;
  const description = String(fields.description ?? '').trim();
  const sku = String(fields.sku ?? '').trim();
  if (!description && !sku) return;
  const memoryKey = intakeLineMemoryKeyFromFields({
    itemCode: sku || undefined,
    description,
  });
  await upsertIntakeCatalogMemory(memoryKey, catalogItemId);
}
