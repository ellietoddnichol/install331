import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Single shared SQLite file for the whole team (all users see the same projects/catalog).
 * Override with DATABASE_PATH or DATABASE_URL (absolute or relative to cwd).
 */
export function resolveEstimatorDbPath(): string {
  const raw = process.env.DATABASE_PATH?.trim() || process.env.DATABASE_URL?.trim();
  const defaultPath = path.join(__dirname, '../../../estimator.db');
  if (!raw) return defaultPath;
  if (path.isAbsolute(raw)) return raw;
  return path.resolve(process.cwd(), raw);
}
