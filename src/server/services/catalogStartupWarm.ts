import { isPgCatalogBackend } from '../db/catalogBackend.ts';
import { getCatalogItemsTableName, getCatalogModifiersReadTableName } from '../db/catalogTable.ts';
import { getCatalogInventoryCounts } from '../repos/catalogRepo.ts';

/**
 * When the catalog lives in Postgres (Supabase pool via DATABASE_URL), there is no Sheets "sync".
 * This run still proves on boot that the server can read configured catalog relations and logs row counts.
 */
export async function warmPostgresCatalogOnStartup(): Promise<void> {
  if (!isPgCatalogBackend()) return;
  const itemsTable = getCatalogItemsTableName();
  const modifiersTable = getCatalogModifiersReadTableName();
  try {
    const inv = await getCatalogInventoryCounts();
    console.log(
      `[catalog] Postgres catalog ready — read ${itemsTable}: ${inv.total} rows (${inv.active} active, ${inv.inactive} inactive); modifiers: ${modifiersTable}`
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(
      `[catalog] Postgres catalog read failed on startup (fix DATABASE_URL / CATALOG_* table names). ${msg}`
    );
  }
}
