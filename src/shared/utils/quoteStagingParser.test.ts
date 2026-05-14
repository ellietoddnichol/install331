import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyQuoteRow,
  extractQuoteHeaderFromText,
  isLikelyTermsPage,
  parseQuoteRowsFromRecords,
  parseTabularQuoteText,
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
  assert.equal(rows[1]?.importSelected, true);
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

test('terms-page detector flags legal narrative blocks without priced table rows', () => {
  const page = [
    'Vendor shall indemnify and hold harmless purchaser.',
    'Insurance certificate and additional insured is required.',
    'Governing law and jurisdiction provisions apply.',
    'Force majeure and limitation of liability section.',
  ].join('\n');
  assert.equal(isLikelyTermsPage(page), true);
});

test('classifyQuoteRow distinguishes service-like and ignored legal lines', () => {
  assert.equal(classifyQuoteRow({ description: 'Installation services', unit: 'SRV', unitCost: 1200, totalCost: 1200 }), 'installation');
  assert.equal(classifyQuoteRow({ description: 'Insurance and indemnify requirements apply', unit: '', unitCost: 0, totalCost: 0 }), 'ignore');
});
