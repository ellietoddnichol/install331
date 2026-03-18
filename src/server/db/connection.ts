import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '../../../estimator.db');

export const estimatorDb = new Database(dbPath);
estimatorDb.pragma('journal_mode = WAL');
estimatorDb.pragma('foreign_keys = ON');
