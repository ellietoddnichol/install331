import test from 'node:test';
import assert from 'node:assert/strict';
import * as xlsx from 'xlsx';
import { parseExcelUpload } from './excelParser.ts';

test('parseExcelUpload extracts spreadsheet rows with sheet and row provenance', () => {
  const worksheet = xlsx.utils.aoa_to_sheet([
    ['Project Name', 'Test School'],
    ['Client', 'District'],
    [],
    ['Room', 'Item Description', 'Qty', 'Unit', 'Manufacturer', 'Model'],
    ['Room 101', 'Grab Bar 36 Stainless Steel', 2, 'EA', 'Bobrick', 'B-5806'],
    ['Lobby', 'Directory Sign', 1, 'EA', 'ASI', '1234'],
  ]);
  const workbook = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(workbook, worksheet, 'Takeoff');
  const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;

  const result = parseExcelUpload({
    fileName: 'school-takeoff.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    dataBase64: buffer.toString('base64'),
  });

  assert.equal(result.fileType, 'excel');
  assert.equal(result.extractedRows.length, 2);
  assert.equal(result.extractedRows[0]?.sourceSheet, 'Takeoff');
  assert.equal(result.extractedRows[0]?.sourceRowNumber, 5);
  assert.equal(result.extractedRows[0]?.mappedFields.roomName, 'Room 101');
  assert.equal(result.extractedRows[0]?.mappedFields.quantity, 2);
  assert.equal(result.metadata.projectName, 'Test School');
});

test('parseExcelUpload maps ugly header aliases into canonical spreadsheet fields', () => {
  const worksheet = xlsx.utils.aoa_to_sheet([
    ['Project', 'Alias Heavy School'],
    ['Owner', 'County District'],
    [],
    ['Area Name', 'Product', 'Count', 'Measure', 'Brand', 'Series', 'Color', 'Comments'],
    ['Vestibule', 'Directory Sign', 1, 'EA', 'ASI', 'D-100', 'Brushed', 'Entry sign'],
  ]);
  const workbook = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(workbook, worksheet, 'Alias Sheet');
  const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;

  const result = parseExcelUpload({
    fileName: 'alias-heavy.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    dataBase64: buffer.toString('base64'),
  });

  assert.equal(result.extractedRows.length, 1);
  assert.equal(result.extractedRows[0]?.mappedFields.roomName, 'Vestibule');
  assert.equal(result.extractedRows[0]?.mappedFields.itemDescription, 'Directory Sign');
  assert.equal(result.extractedRows[0]?.mappedFields.quantity, 1);
  assert.equal(result.extractedRows[0]?.mappedFields.unit, 'EA');
  assert.equal(result.extractedRows[0]?.mappedFields.manufacturer, 'ASI');
  assert.equal(result.extractedRows[0]?.mappedFields.model, 'D-100');
});

test('parseExcelUpload preserves multi-tab workbook detail rows and source sheets', () => {
  const workbook = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(workbook, xlsx.utils.aoa_to_sheet([
    ['Project Name', 'Civic Center Refresh'],
    ['Client', 'City Facilities'],
    ['Summary', 'See room tabs for detail'],
  ]), 'Summary');
  xlsx.utils.book_append_sheet(workbook, xlsx.utils.aoa_to_sheet([
    ['Room', 'Item Description', 'Qty', 'Unit'],
    ['Lobby', 'Directory Sign', 1, 'EA'],
  ]), 'Lobby');
  xlsx.utils.book_append_sheet(workbook, xlsx.utils.aoa_to_sheet([
    ['Room', 'Item Description', 'Qty', 'Unit'],
    ['Restroom 101', 'Grab Bar 36 Stainless Steel', 2, 'EA'],
  ]), 'Restroom');
  const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;

  const result = parseExcelUpload({
    fileName: 'multi-tab.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    dataBase64: buffer.toString('base64'),
  });

  assert.equal(result.sourceSummary.sheetsProcessed.length, 3);
  assert.equal(result.extractedRows.length, 2);
  assert.deepEqual(result.extractedRows.map((row) => row.sourceSheet), ['Lobby', 'Restroom']);
  assert.equal(result.metadata.projectName, 'Civic Center Refresh');
});

test('parseExcelUpload unpivots matrix takeoff sheets with generic row-one headers', () => {
  const worksheet = xlsx.utils.aoa_to_sheet([
    ['Column1', 'Column2', 'Column3', 'Column4', 'Column5', 'Column6'],
    ['', 'Room', 'GB B6806 36', 'CH B212', '', '2 Wall GB'],
    [],
    ['', 'Loadwing A Men', 1, '\\', '', 1],
    ['', 'Linehaul Women', '', 2, '', 1],
    ['', 'TOTALS', 1, 2, '', 2],
  ]);
  const workbook = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(workbook, worksheet, 'Inventory List');
  const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;

  const result = parseExcelUpload({
    fileName: 'matrix-takeoff.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    dataBase64: buffer.toString('base64'),
  });

  assert.equal(result.extractedRows.length, 4);
  assert.deepEqual(
    result.extractedRows.map((row) => ({ room: row.mappedFields.roomName, header: row.rawHeader, qty: row.mappedFields.quantity, column: row.sourceColumn })),
    [
      { room: 'Loadwing A Men', header: 'GB B6806 36', qty: 1, column: 'C' },
      { room: 'Loadwing A Men', header: '2 Wall GB', qty: 1, column: 'F' },
      { room: 'Linehaul Women', header: 'CH B212', qty: 2, column: 'D' },
      { room: 'Linehaul Women', header: '2 Wall GB', qty: 1, column: 'F' },
    ]
  );
  assert.equal(result.extractedRows.every((row) => row.structureType === 'matrix'), true);
  assert.equal(result.warnings.some((warning) => warning.includes('Ignored totals')), true);
});

test('parseExcelUpload keeps matrix job metadata separate from shorthand headers', () => {
  const worksheet = xlsx.utils.aoa_to_sheet([
    ['Column1', 'Column2', 'Column3', 'Column4'],
    ['JOB: FedEx Refresh KCMO', 'B290 1836', 'GB B6806 42', 'GB 36'],
    ['Loadwing A Men', 1, 1, 1],
    ['Linehaul Women', 1, 1, 1],
    ['TOTALS', 2, 2, 2],
  ]);
  const workbook = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(workbook, worksheet, 'Inventory List');
  const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;

  const result = parseExcelUpload({
    fileName: 'matrix-metadata.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    dataBase64: buffer.toString('base64'),
  });

  assert.equal(result.metadata.projectName, 'FedEx Refresh KCMO');
  assert.equal(result.metadata.projectName?.includes('B290 1836'), false);
  assert.equal(result.extractedRows.length, 6);
});

test('parseExcelUpload trims long takeoff shorthand tails from project titles', () => {
  const worksheet = xlsx.utils.aoa_to_sheet([
    ['Column1', 'Column2', 'Column3', 'Column4', 'Column5', 'Column6', 'Column7', 'Column8', 'Column9', 'Column10', 'Column11', 'Column12', 'Column13', 'Column14', 'Column15', 'Column16', 'Column17', 'Column18'],
    ['JOB: FedEx Refresh KCMO', 'B290 1836', 'GB B6806 42', 'GB 36', 'GB 18', 'CH B212', 'SNV B2706', 'SND B270', 'SD W51919-04', 'LTX-12', 'TTD W556509', 'HD XL-SB', 'w/ Recess Kit', 'SCR 36', 'SC', 'SCH', '2 Wall GB', 'FSS'],
    ['Loadwing A Men', 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    ['TOTALS', 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  ]);
  const workbook = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(workbook, worksheet, 'Inventory List');
  const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;

  const result = parseExcelUpload({
    fileName: 'fedex-matrix-metadata.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    dataBase64: buffer.toString('base64'),
  });

  assert.equal(result.metadata.projectName, 'FedEx Refresh KCMO');
  assert.equal(result.metadata.projectName?.includes('W51919-04'), false);
  assert.equal(result.metadata.projectName?.includes('2 Wall GB'), false);
});

test('parseExcelUpload handles workbooks with both matrix and flat tabs', () => {
  const workbook = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(workbook, xlsx.utils.aoa_to_sheet([
    ['Column1', 'Column2', 'Column3', 'Column4'],
    ['', 'Room', 'GB B6806 36', 'SNV B2706'],
    ['', 'Lobby', 1, 1],
    ['', 'Back of House', 1, ''],
    ['', 'TOTALS', 2, 1],
  ]), 'Inventory List');
  xlsx.utils.book_append_sheet(workbook, xlsx.utils.aoa_to_sheet([
    ['Room', 'Item Description', 'Qty', 'Unit'],
    ['Vestibule', 'Directory Sign', 1, 'EA'],
  ]), 'Signs');
  const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;

  const result = parseExcelUpload({
    fileName: 'mixed-workbook.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    dataBase64: buffer.toString('base64'),
  });

  assert.equal(result.extractedRows.length, 4);
  assert.deepEqual(result.extractedRows.map((row) => row.sourceSheet), ['Inventory List', 'Inventory List', 'Inventory List', 'Signs']);
});