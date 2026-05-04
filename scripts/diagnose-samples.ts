/**
 * One-off: inspect how intake parsers see sample files in repo root.
 * Run: npx tsx scripts/diagnose-samples.ts
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseExcelUpload } from '../src/server/services/intake/excelParser.ts';
import { parsePdfUpload } from '../src/server/services/intake/pdfParser.ts';
import { normalizePdfLinesDeterministically } from '../src/server/services/intake/normalizer.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

const excelFiles = ['TA Takeoff.xlsx', 'TA Takeoff (1).xlsx', 'TA Takeoff (3).xlsx'];
const pdfFile = 'Fire Fighters Proposal CWA.pdf';

function runExcel(name: string) {
  const p = path.join(root, name);
  if (!fs.existsSync(p)) {
    console.log(`[missing] ${name}`);
    return;
  }
  const r = parseExcelUpload({
    fileName: name,
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    dataBase64: fs.readFileSync(p).toString('base64'),
  });
  console.log(`\n=== ${name} ===`);
  console.log(`extractedRows: ${r.extractedRows.length}`);
  console.log(`sheets: ${r.sourceSummary.sheetsProcessed.join(', ')}`);
  console.log(`warnings (first 8):`, r.warnings.slice(0, 8));
  const sample = r.extractedRows.slice(0, 3);
  for (const row of sample) {
    const m = row.mappedFields;
    console.log('  row:', {
      room: m.roomName,
      desc: (m.itemDescription || '').slice(0, 80),
      qty: m.quantity,
      unit: m.unit,
    });
  }
}

async function runPdf() {
  const p = path.join(root, pdfFile);
  if (!fs.existsSync(p)) {
    console.log(`[missing] ${pdfFile}`);
    return;
  }
  const pdf = await parsePdfUpload({
    fileName: pdfFile,
    mimeType: 'application/pdf',
    dataBase64: fs.readFileSync(p).toString('base64'),
  });
  console.log(`\n=== ${pdfFile} ===`);
  console.log(`pages: ${pdf.document.pages.length}, chunks: ${pdf.chunks.length}`);
  console.log(`metadata projectName: ${pdf.metadata.projectName || '(none)'}`);
  const c0 = pdf.chunks[0];
  if (c0) {
    console.log(`chunk[0] page ${c0.pageNumber} len ${c0.text.length}`);
    console.log(c0.text.slice(0, 500).replace(/\n/g, ' | '));
  }
  const det = normalizePdfLinesDeterministically({ fileName: pdfFile, chunks: pdf.chunks });
  const detStrict = normalizePdfLinesDeterministically(
    { fileName: pdfFile, chunks: pdf.chunks },
    { scopeRowFilter: 'strict' }
  );
  console.log(`deterministic lines (lenient): ${det.length}, strict: ${detStrict.length}`);
  if (det[0]) console.log('  sample lenient:', det[0].description.slice(0, 100));
  if (detStrict[0]) console.log('  sample strict:', detStrict[0].description.slice(0, 100));
}

for (const f of excelFiles) runExcel(f);
await runPdf();
