import fs from 'fs';
import path from 'path';
import * as xlsx from 'xlsx';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

for (const name of ['TA Takeoff.xlsx', 'TA Takeoff (1).xlsx']) {
  const wb = xlsx.read(fs.readFileSync(path.join(root, name)), { type: 'buffer', cellText: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = xlsx.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' }) as unknown[][];
  console.log(`\n=== ${name} first 20 rows ===`);
  rows.slice(0, 20).forEach((r, i) => {
    const cells = r.map((c) => String(c ?? '').trim()).filter(Boolean);
    console.log(i, cells.slice(0, 8).join(' | '));
  });
}
