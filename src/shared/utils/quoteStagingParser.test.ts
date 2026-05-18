import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyQuoteRow,
  extractQuoteHeaderFromText,
  isLikelyTermsPage,
  parseFreeformPricedQuoteLines,
  parseQuotePasteText,
  parseQuoteRowsFromRecords,
  parseTabularQuoteText,
  shouldImportRowType,
} from './quoteStagingParser.ts';

test('parseTabularQuoteText maps obvious priced rows and keeps freight/service units', () => {
  const input = [
    'Item,Description,Qty,Unit,Unit Cost,Total Cost',
    '1,28 Five-Tier; Model E Locker - PLAM Interior 72"H x 12"W x 12"D,12,EA,1250.00,15000.00',
    '2,FTL Freight - Ship to Nacogdoches TX,1,FRT,1450.00,1450.00',
    '3,Installation services,1,SRV,3600.00,3600.00',
  ].join('\n');

  const rows = parseTabularQuoteText(input);
  assert.equal(rows.length, 3);
  assert.equal(rows[0]?.rowType, 'material');
  assert.equal(rows[1]?.rowType, 'freight');
  assert.equal(rows[2]?.rowType, 'installation');
  assert.equal(rows[0]?.importSelected, true);
  assert.equal(rows[1]?.importSelected, false);
});

test('parseFreeformPricedQuoteLines parses Bobrick-style priced material row', () => {
  const rows = parseFreeformPricedQuoteLines('6 EA B-6806 36" Grab Bar $42.00 each - $252.00');
  assert.equal(rows.length, 1);
  const row = rows[0];
  assert.equal(row?.qty, 6);
  assert.equal(row?.unit, 'EA');
  assert.equal(row?.rowType, 'material');
  assert.equal(row?.importSelected, true);
  assert.match(String(row?.rawDescription), /grab bar/i);
  assert.equal(row?.skuModel, 'B-6806');
  assert.equal(row?.unitCost, 42);
  assert.equal(row?.totalCost, 252);
});

test('parseFreeformPricedQuoteLines classifies freight and does not auto-select for import', () => {
  const colon = parseFreeformPricedQuoteLines('Freight: $350.00');
  assert.equal(colon.length, 1);
  assert.equal(colon[0]?.rowType, 'freight');
  assert.equal(colon[0]?.importSelected, false);

  const ls = parseFreeformPricedQuoteLines('1 LS Freight $350.00');
  assert.equal(ls.length, 1);
  assert.equal(ls[0]?.rowType, 'freight');
  assert.equal(ls[0]?.importSelected, false);
});

test('parseFreeformPricedQuoteLines marks subtotal tax and total rows as non-importable', () => {
  const text = [
    'Material Total: $1,540.00',
    'Sales Tax: $0.00',
    'Quote Total: $1,725.00',
    'Terms and Conditions',
    'Payment Terms: Net 30',
  ].join('\n');
  const rows = parseFreeformPricedQuoteLines(text);
  assert.ok(rows.length >= 4);
  for (const row of rows) {
    assert.equal(row.importSelected, false);
    assert.ok(row.rowType === 'ignore' || row.rowType === 'note');
  }
});

test('terms-page detector flags legal narrative blocks without priced table rows', () => {
  const page = [
    'Vendor shall indemnify and hold harmless purchaser.',
    'Insurance certificate and additional insured is required.',
    'Governing law and jurisdiction provisions apply.',
    'Force majeure and limitation of liability section.',
  ].join('\n');
  assert.equal(isLikelyTermsPage(page), true);
  assert.equal(parseFreeformPricedQuoteLines(page).length, 0);
});

test('parseQuotePasteText keeps clean CSV on table-shaped input', () => {
  const table = [
    'Item,Description,Qty,Unit,Unit Cost,Total Cost',
    '1,Mirror kit,4,EA,95.00,380.00',
  ].join('\n');
  const routed = parseQuotePasteText(table);
  const direct = parseTabularQuoteText(table);
  assert.deepEqual(routed.map((r) => r.rawDescription), direct.map((r) => r.rawDescription));
});

test('parseQuotePasteText routes Bobrick freeform paste to freeform parser', () => {
  const paste = [
    'Vendor: Bobrick',
    '6 EA B-6806 36" Grab Bar $42.00 each - $252.00',
    'Freight: $185.00',
    'Material Total: $1,540.00',
  ].join('\n');
  const rows = parseQuotePasteText(paste);
  const material = rows.filter((r) => r.rowType === 'material');
  const freight = rows.filter((r) => r.rowType === 'freight');
  const summary = rows.filter((r) => r.rowType === 'ignore' || r.rowType === 'note');
  assert.equal(material.length, 1);
  assert.equal(freight.length, 1);
  assert.ok(summary.length >= 1);
  assert.equal(material[0]?.importSelected, true);
  assert.equal(freight[0]?.importSelected, false);
});

test('parseQuoteRowsFromRecords supports heuristic mapping of common headers', () => {
  const rows = parseQuoteRowsFromRecords([
    {
      'Line Number': '10',
      'Item Description': '000P96246B Lock package',
      Quantity: '28',
      UOM: 'EA',
      'Unit Price': '42.50',
      'Line Total': '1190.00',
    },
  ]);

  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.lineNumber, '10');
  assert.equal(rows[0]?.skuModel, '000P96246B');
  assert.equal(rows[0]?.rowType, 'accessory');
});

test('extractQuoteHeaderFromText reads quote metadata from vendor-style header blocks', () => {
  const text = [
    'Hollman, Inc.',
    'Purchase Order No: PO-44911',
    'Quote Date: 05/10/2026',
    'Delivery Date: 06/15/2026',
    'Ship To',
    'Nacogdoches ISD Warehouse',
    'Nacogdoches, TX',
  ].join('\n');

  const header = extractQuoteHeaderFromText(text);
  assert.equal(header.vendorName, 'Hollman, Inc.');
  assert.equal(header.quoteNumber, 'PO-44911');
  assert.equal(header.quoteDate, '05/10/2026');
  assert.equal(header.deliveryDate, '06/15/2026');
  assert.match(String(header.shipTo || ''), /Nacogdoches ISD/i);
});

test('classifyQuoteRow distinguishes service-like and ignored legal lines', () => {
  assert.equal(classifyQuoteRow({ description: 'Installation services', unit: 'SRV', unitCost: 1200, totalCost: 1200 }), 'installation');
  assert.equal(classifyQuoteRow({ description: 'Insurance and indemnify requirements apply', unit: '', unitCost: 0, totalCost: 0 }), 'ignore');
  assert.equal(classifyQuoteRow({ description: 'Material Subtotal', unit: 'EA', unitCost: 0, totalCost: 1540 }), 'ignore');
  assert.equal(shouldImportRowType('freight'), false);
  assert.equal(shouldImportRowType('material'), true);
});
