import assert from 'node:assert/strict';
import test from 'node:test';
import { preflightCatalogWorkbookSync } from './catalogSyncWorkbookValidation.ts';

const minimalItems = [
  ['SKU', 'Description', 'Active'],
  ['sh-3t-ss-02', 'Shelf unit', 'TRUE'],
  ['mb-4x4', 'Board', 'TRUE'],
];

const minimalModifiers = [
  ['ModifierKey', 'Name', 'Active'],
  ['K', 'N', 'TRUE'],
];

test('generic_name multi-target aliases are allowed when strict preflight flag is off', async () => {
  const strictKey = 'CATALOG_SYNC_PREFLIGHT_STRICT_GENERIC_NAME_ALIASES' as const;
  const prev = process.env[strictKey];
  try {
    delete process.env[strictKey];
    const aliasRows = [
      ['Canonical_SKU', 'AliasType', 'AliasValue', 'Active'],
      ['sh-3t-ss-02', 'generic_name', 'shelving', 'TRUE'],
      ['mb-4x4', 'generic_name', 'shelving', 'TRUE'],
      ['sh-3t-ss-02', 'generic_name', 'whiteboard', 'TRUE'],
      ['mb-4x4', 'generic_name', 'whiteboard', 'TRUE'],
    ];
    const pre = await preflightCatalogWorkbookSync({
      itemRows: minimalItems,
      modifierRows: minimalModifiers,
      bundleRows: [['BundleName', 'Active']],
      aliasRows,
      attributeRows: null,
    });
    assert.equal(
      pre.warnings.some((w) => w.includes('generic_name|shelving')),
      false,
      pre.warnings.join('\n')
    );
    assert.equal(pre.blocking.length, 0, pre.blocking.join('\n'));
    assert.equal(pre.audit.catalogReview?.aliasMultiTargetCount ?? 0, 0);
  } finally {
    if (prev === undefined) delete process.env[strictKey];
    else process.env[strictKey] = prev;
  }
});

test('generic_name multi-target aliases block when strict preflight flag is on', async () => {
  const strictKey = 'CATALOG_SYNC_PREFLIGHT_STRICT_GENERIC_NAME_ALIASES' as const;
  const prev = process.env[strictKey];
  try {
    process.env[strictKey] = '1';
    const aliasRows = [
      ['Canonical_SKU', 'AliasType', 'AliasValue', 'Active'],
      ['sh-3t-ss-02', 'generic_name', 'shelving', 'TRUE'],
      ['mb-4x4', 'generic_name', 'shelving', 'TRUE'],
    ];
    const pre = await preflightCatalogWorkbookSync({
      itemRows: minimalItems,
      modifierRows: minimalModifiers,
      bundleRows: [['BundleName', 'Active']],
      aliasRows,
      attributeRows: null,
    });
    assert.ok(pre.blocking.some((b) => b.includes('generic_name|shelving')));
    assert.equal(pre.audit.catalogReview?.aliasMultiTargetCount, 1);
  } finally {
    if (prev === undefined) delete process.env[strictKey];
    else process.env[strictKey] = prev;
  }
});

test('non-generic alias multi-target still blocks', async () => {
  const strictKey = 'CATALOG_SYNC_PREFLIGHT_STRICT_GENERIC_NAME_ALIASES' as const;
  const prev = process.env[strictKey];
  try {
    delete process.env[strictKey];
    const aliasRows = [
      ['Canonical_SKU', 'AliasType', 'AliasValue', 'Active'],
      ['sh-3t-ss-02', 'legacy_sku', 'OLD-SKU', 'TRUE'],
      ['mb-4x4', 'legacy_sku', 'OLD-SKU', 'TRUE'],
    ];
    const pre = await preflightCatalogWorkbookSync({
      itemRows: minimalItems,
      modifierRows: minimalModifiers,
      bundleRows: [['BundleName', 'Active']],
      aliasRows,
      attributeRows: null,
    });
    assert.ok(pre.blocking.some((b) => b.includes('legacy_sku|old-sku')));
  } finally {
    if (prev === undefined) delete process.env[strictKey];
    else process.env[strictKey] = prev;
  }
});
