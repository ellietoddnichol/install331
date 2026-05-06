/**
 * End-to-end workspace flow against Supabase Postgres (same code paths as v1 HTTP).
 *
 * Prereqs:
 *   DATABASE_URL=postgresql://...  (pooler or direct)
 *   npm run db:migrate   (applies supabase/migrations including workspace parity)
 *
 * Usage:
 *   set DB_DRIVER=pg
 *   set CATALOG_BACKEND=pg
 *   set CATALOG_ITEMS_TABLE=public.catalog_items_clean
 *   npm run smoke:pg-workspace
 *
 * Optional HTTP checks (server must already be listening):
 *   set SMOKE_HTTP_BASE=http://127.0.0.1:3000
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
for (const [name, override] of [
  ['.env', false],
  ['.env.local', true],
] as const) {
  const full = path.join(root, name);
  if (fs.existsSync(full)) dotenv.config({ path: full, override });
}

process.env.DB_DRIVER = 'pg';
process.env.CATALOG_BACKEND = process.env.CATALOG_BACKEND || 'pg';
process.env.CATALOG_ITEMS_TABLE = process.env.CATALOG_ITEMS_TABLE || 'public.catalog_items_clean';

const databaseUrl = String(process.env.DATABASE_URL || '').trim();
if (!databaseUrl) {
  console.error('[smoke] DATABASE_URL is required (Supabase Postgres connection string).');
  process.exit(1);
}

async function httpCheck(label: string, url: string): Promise<{ ok: boolean; summary: string }> {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    const text = await r.text();
    const clip = text.length > 200 ? `${text.slice(0, 200)}…` : text;
    return { ok: r.ok, summary: `${r.status} ${clip}` };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, summary: msg };
  }
}

async function main() {
  const base = String(process.env.SMOKE_HTTP_BASE || '').trim();
  if (base) {
    const h1 = await httpCheck('GET /healthz', `${base.replace(/\/$/, '')}/healthz`);
    console.log(`[smoke] HTTP /healthz → ${h1.ok ? 'PASS' : 'FAIL'} (${h1.summary})`);
    const h2 = await httpCheck('GET /api/v1/catalog-health', `${base.replace(/\/$/, '')}/api/v1/catalog-health`);
    console.log(`[smoke] HTTP /api/v1/catalog-health → ${h2.ok ? 'PASS' : 'FAIL'} (${h2.summary})`);
  } else {
    console.log('[smoke] SMOKE_HTTP_BASE unset — skipping HTTP checks (set to e.g. http://127.0.0.1:3000 to probe a running server).');
  }

  const { closePgPool } = await import('../src/server/db/pgPool.ts');
  const { dbCatalogGet } = await import('../src/server/db/query.ts');
  const { listProjects, createProject, getProject, deleteProject } = await import('../src/server/repos/projectsRepo.ts');
  const { createRoom, listRooms } = await import('../src/server/repos/roomsRepo.ts');
  const {
    createTakeoffLine,
    updateTakeoffLine,
    listTakeoffLines,
    bulkMoveTakeoffLinesToRoom,
  } = await import('../src/server/repos/takeoffRepo.ts');
  const { calculateEstimateSummary } = await import('../src/server/services/estimateEngineV1.ts');
  const { getSettings } = await import('../src/server/repos/settingsRepo.ts');
  const { getCatalogItemsTableName } = await import('../src/server/db/catalogTable.ts');

  let projectId = '';
  let roomA = '';
  let roomB = '';
  let lineManual = '';
  let lineCat: string | null = null;

  try {
    const before = await listProjects();
    console.log(`[smoke] listProjects → ${before.length} project(s)`);

    const created = await createProject({ projectName: `PG smoke ${Date.now()}` });
    projectId = created.id;
    console.log(`[smoke] createProject → id=${projectId}`);

    const got = await getProject(projectId);
    if (!got) throw new Error('getProject returned null');

    const room1 = await createRoom({ projectId, roomName: 'Room A' });
    const room2 = await createRoom({ projectId, roomName: 'Room B' });
    roomA = room1.id;
    roomB = room2.id;
    console.log(`[smoke] createRoom → A=${roomA} B=${roomB}`);

    const roomsListed = await listRooms(projectId);
    if (roomsListed.length < 2) throw new Error('listRooms expected 2 rooms');

    const manual = await createTakeoffLine({
      projectId,
      roomId: roomA,
      description: 'Manual line',
      sourceType: 'manual',
      qty: 1,
      unit: 'EA',
      materialCost: 25,
      laborMinutes: 0,
    });
    lineManual = manual.id;
    console.log(`[smoke] createTakeoffLine (manual) → ${lineManual}`);

    const table = getCatalogItemsTableName();
    const catRow = await dbCatalogGet<{ id: string }>(`SELECT id FROM ${table} WHERE active = 1 LIMIT 1`, []);
    if (catRow?.id) {
      const catLine = await createTakeoffLine({
        projectId,
        roomId: roomA,
        description: 'Catalog-backed smoke line',
        sourceType: 'catalog',
        catalogItemId: catRow.id,
        qty: 1,
        unit: 'EA',
      });
      lineCat = catLine.id;
      console.log(`[smoke] createTakeoffLine (catalog ${catRow.id}) → ${lineCat}`);
    } else {
      console.log('[smoke] skip catalog-backed line (no active row in ' + table + ')');
    }

    const qtyUpd = await updateTakeoffLine(lineManual, { qty: 3 });
    if (qtyUpd?.qty !== 3) throw new Error('qty update failed');

    const moved = await bulkMoveTakeoffLinesToRoom([lineManual], roomB);
    if ('error' in moved) throw new Error(moved.error);
    console.log(`[smoke] bulkMoveTakeoffLinesToRoom → ${moved.lines.length} line(s)`);

    const lines = await listTakeoffLines(projectId);
    const summary = await calculateEstimateSummary(got, lines);
    console.log(`[smoke] calculateEstimateSummary → baseBidTotal=${summary.baseBidTotal}`);

    const settings = await getSettings();
    console.log(`[smoke] getSettings → companyName len=${String(settings.companyName || '').length}`);

    console.log('[smoke] ALL REPO STEPS PASSED');
  } finally {
    if (projectId) {
      await deleteProject(projectId);
      console.log(`[smoke] cleanup deleteProject(${projectId})`);
    }
    await closePgPool();
  }
}

main().catch((err) => {
  console.error('[smoke] FAILED:', err instanceof Error ? err.message : err);
  process.exit(1);
});
