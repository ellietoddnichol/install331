import { getEstimatorDb } from '../db/connection.ts';
import { isPgDriver } from '../db/driver.ts';
import { createSqliteDbExec, withPgTransaction, type DbExec } from '../db/query.ts';

/**
 * Google Sheets catalog sync and other catalog write bundles use one transaction:
 * Postgres → pooled client; SQLite → explicit BEGIN IMMEDIATE with shared DbExec.
 */
export async function withCatalogSyncWriteTransaction<T>(fn: (ex: DbExec) => Promise<T>): Promise<T> {
  if (isPgDriver()) {
    return withPgTransaction(fn);
  }
  const db = getEstimatorDb();
  await db.prepare('BEGIN IMMEDIATE').run();
  try {
    const ex = createSqliteDbExec();
    const out = await fn(ex);
    await db.prepare('COMMIT').run();
    return out;
  } catch (err) {
    await db.prepare('ROLLBACK').run();
    throw err;
  }
}
