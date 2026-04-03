import Database from 'better-sqlite3';
import { initLegacyDb } from '../legacyInit.ts';
import { initEstimatorSchema } from './schema.ts';
import { resolveEstimatorDbPath } from './resolveEstimatorDbPath.ts';

const dbPath = resolveEstimatorDbPath();
export const estimatorDb = new Database(dbPath);
estimatorDb.pragma('journal_mode = WAL');
estimatorDb.pragma('foreign_keys = ON');
initLegacyDb(estimatorDb);
initEstimatorSchema(estimatorDb);

export function getEstimatorDb(): Database {
  return estimatorDb;
}
