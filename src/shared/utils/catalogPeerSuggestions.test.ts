import test from 'node:test';
import assert from 'node:assert/strict';
import type { CatalogItem } from '../../types';
import { computeCatalogPeerPricingSuggestion } from './catalogPeerSuggestions';

function item(partial: Partial<CatalogItem> & Pick<CatalogItem, 'id' | 'sku' | 'description'>): CatalogItem {
  return {
    category: 'Division 10',
    uom: 'EA',
    baseMaterialCost: 0,
    baseLaborMinutes: 0,
    taxable: true,
    adaFlag: false,
    active: true,
    ...partial,
  };
}

test('returns averages for overlapping descriptions in category', () => {
  const catalog: CatalogItem[] = [
    item({ id: '1', sku: 'A', description: 'Soap dispenser surface mount stainless', baseMaterialCost: 40, baseLaborMinutes: 20 }),
    item({ id: '2', sku: 'B', description: 'Soap dispenser deck mount chrome', baseMaterialCost: 60, baseLaborMinutes: 40 }),
    item({ id: '3', sku: 'C', description: 'Mirror frameless 18x36', baseMaterialCost: 100, baseLaborMinutes: 30 }),
  ];
  const s = computeCatalogPeerPricingSuggestion(catalog, {
    description: 'Soap dispenser wall mount new style',
    category: 'Division 10',
    uom: 'EA',
  });
  assert.ok(s);
  assert.equal(s!.peerCount, 2);
  assert.equal(s!.avgMaterialCost, 50);
  assert.equal(s!.avgLaborMinutes, 30);
  assert.ok(s!.keywordsLabel.includes('soap'));
  assert.equal(s!.narrowedByUom, true);
});

test('returns null when no token overlap', () => {
  const catalog: CatalogItem[] = [
    item({ id: '1', sku: 'A', description: 'Paper towel unit', baseMaterialCost: 10, baseLaborMinutes: 5 }),
  ];
  assert.equal(
    computeCatalogPeerPricingSuggestion(catalog, {
      description: 'Toilet partition',
      category: 'Division 10',
    }),
    null
  );
});

test('returns null for wrong category', () => {
  const catalog: CatalogItem[] = [
    item({ id: '1', sku: 'A', description: 'Soap dispenser chrome', baseMaterialCost: 10, baseLaborMinutes: 5, category: 'Division 10' }),
  ];
  assert.equal(
    computeCatalogPeerPricingSuggestion(catalog, {
      description: 'Soap dispenser',
      category: 'Division 8',
    }),
    null
  );
});
