import test from 'node:test';
import assert from 'node:assert/strict';
import { extractRowsFromPdfPages } from './quoteSourceExtractionService.ts';

test('extractRowsFromPdfPages parses PO-style rows split across nearby lines and suppresses terms pages', () => {
  const pages = [
    [
      'Hollman Inc Purchase Order PO-7781 Page 1 of 3',
      'Vendor ID 102211 Req No 5001',
      '000P42553A',
      '28 Five-Tier Model E Locker - PLAM Interior 72"H x 12"W x 12"D',
      '12 EA 1250.00 15000.00',
      '000P96246B Lock Package',
      '12 EA 42.50 510.00',
      'Filler panel for end conditions',
      '3 EA 95.00 285.00',
      'Base trim package',
      '1 EA 185.00 185.00',
      'FTL Freight - Ship to: Nacogdoches TX',
      '1 FRT 1450.00 1450.00',
      'Installation services',
      '1 SRV 3600.00 3600.00',
    ].join('\n'),
    [
      'Purchase Order PO-7781 Page 2 of 3',
      'Insurance requirements include workers compensation and liability.',
      'Vendor shall indemnify purchaser and provide certificate of insurance.',
      'Additional insured language and liquidated damages clause.',
      'Governing law and jurisdiction statements apply.',
    ].join('\n'),
  ];

  const rows = extractRowsFromPdfPages(pages);
  assert.ok(rows.length >= 5, `expected at least 5 parsed rows but received ${rows.length}`);

  const descriptions = rows.map((row) => row.rawDescription.toLowerCase());
  assert.ok(descriptions.some((d) => d.includes('locker')));
  assert.ok(descriptions.some((d) => d.includes('lock package')));
  assert.ok(descriptions.some((d) => d.includes('filler panel')));
  assert.ok(descriptions.some((d) => d.includes('base trim')));
  assert.ok(descriptions.some((d) => d.includes('freight')));
  assert.ok(descriptions.some((d) => d.includes('installation')));

  const freightRow = rows.find((row) => row.unit === 'FRT');
  const serviceRow = rows.find((row) => row.unit === 'SRV');
  assert.equal(freightRow?.rowType, 'freight');
  assert.equal(serviceRow?.rowType, 'installation');

  assert.ok(rows.every((row) => !/workers compensation|liquidated damages|additional insured/i.test(row.rawDescription)));
});

test('extractRowsFromPdfPages keeps staged rows when later pages are mostly legal narrative', () => {
  const pages = [
    [
      '000P45055B',
      'Locker item with woodgrain finish',
      '8 EA 980.00 7840.00',
    ].join('\n'),
    [
      'Terms and Conditions',
      'Insurance and liability provisions apply.',
      'Hold harmless and governing law clause.',
      'Additional insured and certificate language.',
    ].join('\n'),
  ];

  const rows = extractRowsFromPdfPages(pages);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.qty, 8);
  assert.equal(rows[0]?.unit, 'EA');
  assert.equal(rows[0]?.unitCost, 980);
  assert.equal(rows[0]?.totalCost, 7840);
});

test('extractRowsFromPdfPages parses column-vector PO pages with SKU blocks plus split qty/unit/cost columns', () => {
  const pages = [
    [
      'Description',
      '000P42553A',
      'LOCKERS, STORAGE',
      '28 Five-Tier; Model E Locker - PLAM Interior 72"H x 12"W x 12"D',
      '000P45055B',
      'LOCKS, ALL TYPES',
      'Keyless1 - Matte Black - RH',
      '000P42553A',
      'LOCKERS, STORAGE',
      'PL Filler Panel 24"W x 84"H',
      '12600.00',
      '8400.00',
      '150.00',
      'EA',
      'EA',
      'EA',
      '450.0000',
      '60.0000',
      '50.0000',
      '28.00',
      '140.00',
      '3.00',
      '000P96286A',
      'FREIGHT, QUOTED',
      'FTL Freight - Ship to: Nacogdoches, TX',
      '000P96246B',
      'INSTALLATION SERVICES, (NOT OTHERWISE CLASSIFIED)',
      '1200.00',
      '7500.00',
      'FRT',
      'SRV',
      '1200.0000',
      '7500.0000',
      '1.00',
      '1.00',
      'Insurance requirements include workers compensation and liability.',
      'Additional insured language and liquidated damages clause.',
    ].join('\n'),
  ];

  const rows = extractRowsFromPdfPages(pages);
  assert.ok(rows.length >= 5, `expected at least 5 parsed rows but received ${rows.length}`);
  assert.ok(rows.some((row) => /locker/i.test(row.rawDescription)));
  assert.ok(rows.some((row) => /lock/i.test(row.rawDescription)));
  assert.ok(rows.some((row) => /filler/i.test(row.rawDescription)));
  assert.ok(rows.some((row) => /freight/i.test(row.rawDescription) && row.rowType === 'freight'));
  assert.ok(rows.some((row) => /installation/i.test(row.rawDescription) && row.rowType === 'installation'));
});
