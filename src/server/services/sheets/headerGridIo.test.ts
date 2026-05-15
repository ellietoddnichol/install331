import test from 'node:test';
import assert from 'node:assert/strict';
import { findHeaderRowIndex, gridToObjects } from './headerGridIo.ts';

test('findHeaderRowIndex skips Div 10 title and description rows before CatalogItemID', () => {
  const values = [
    ['CatalogItems'],
    ['Div 10 catalog source of truth. Catalog match can supply labor minutes.'],
    [],
    ['CatalogItemID', 'SKU', 'Category', 'Subcategory', 'Manufacturer', 'Description', 'Unit', 'Active'],
    ['cat-grab-42', 'BB-42', 'Grab Bars', '', 'Bobrick', '42in grab bar', 'EA', 'TRUE'],
  ];
  assert.equal(findHeaderRowIndex(values), 3);
  const { headers, rows } = gridToObjects(values);
  assert.equal(headers[0], 'CatalogItemID');
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.CatalogItemID, 'cat-grab-42');
  assert.equal(rows[0]?.SKU, 'BB-42');
});
