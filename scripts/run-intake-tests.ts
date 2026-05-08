import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const fullPath = join(dir, entry);
    return statSync(fullPath).isDirectory() ? walk(fullPath) : [fullPath];
  });
}

const intakeDir = join(root, 'src', 'server', 'services', 'intake');
const testFiles = walk(intakeDir).filter((f) => f.endsWith('.test.ts')).sort();
if (!testFiles.length) {
  console.error('No intake test files found');
  process.exit(1);
}
const result = spawnSync(process.execPath, ['--import', 'tsx', '--test', ...testFiles], { stdio: 'inherit' });
process.exit(result.status ?? 1);
