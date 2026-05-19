import path from 'path';
import { fileURLToPath } from 'url';
import { isPgDriver } from './driver.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Single shared SQLite file for the whole team (all users see the same projects/catalog).
 * Override with SQLITE_PATH, SQLITE_DB, or DATABASE_PATH (absolute or relative to cwd).
 * DATABASE_URL is reserved for Postgres (`DB_DRIVER=pg`) and is not used as a SQLite path.
 */
export function resolveEstimatorDbPath(): string {
  const raw =
    process.env.SQLITE_PATH?.trim() ||
    process.env.SQLITE_DB?.trim() ||
    process.env.DATABASE_PATH?.trim() ||
    (isPgDriver() ? process.env.DATABASE_URL?.trim() : '');
  const isProd = process.env.NODE_ENV === 'production';
  // In container deployments (e.g. Cloud Run), the image filesystem is ephemeral across revisions.
  // Default to a data directory path that can be mounted/backed up.
  const defaultPath = isProd ? '/data/estimator.db' : path.join(__dirname, '../../../estimator.db');
  if (!raw) return defaultPath;
  if (path.isAbsolute(raw)) return raw;
  return path.resolve(process.cwd(), raw);
}
