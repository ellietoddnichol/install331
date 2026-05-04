import test from 'node:test';
import assert from 'node:assert/strict';
import {
  filterDisplayRowsVisibleInTable,
  toggleBulkSelectionForVisibleConcrete,
  visibleConcreteLineIds,
} from './estimateBulkSelection.ts';

test('visibleConcreteLineIds skips rolled-up rows (canDelete false)', () => {
  const ids = visibleConcreteLineIds([
    { lineId: 'a', canDelete: true },
    { lineId: 'b', canDelete: false },
    { lineId: 'c', canDelete: true },
  ]);
  assert.deepEqual(ids, ['a', 'c']);
});

test('toggleBulkSelectionForVisibleConcrete adds all visible when not fully selected', () => {
  const next = toggleBulkSelectionForVisibleConcrete(new Set(['x']), ['a', 'b']);
  assert.ok(next.has('x'));
  assert.ok(next.has('a'));
  assert.ok(next.has('b'));
});

test('toggleBulkSelectionForVisibleConcrete removes visible when all were selected', () => {
  const next = toggleBulkSelectionForVisibleConcrete(new Set(['a', 'b', 'x']), ['a', 'b']);
  assert.ok(next.has('x'));
  assert.equal(next.has('a'), false);
  assert.equal(next.has('b'), false);
});

test('filterDisplayRowsVisibleInTable hides non-start lines when bundle collapsed', () => {
  const rows = [
    { bundleId: 'b1', lineId: '1' },
    { bundleId: 'b1', lineId: '2' },
    { bundleId: null, lineId: '3' },
  ] as const;
  const visible = filterDisplayRowsVisibleInTable([...rows], 'room', new Set(['b1']));
  assert.equal(visible.length, 2);
  assert.equal(visible[0]!.lineId, '1');
  assert.equal(visible[1]!.lineId, '3');
});

test('filterDisplayRowsVisibleInTable keeps all rows for organizeBy item', () => {
  const rows = [
    { bundleId: 'b1', lineId: '1' },
    { bundleId: 'b1', lineId: '2' },
  ];
  const visible = filterDisplayRowsVisibleInTable(rows, 'item', new Set(['b1']));
  assert.equal(visible.length, 2);
});
