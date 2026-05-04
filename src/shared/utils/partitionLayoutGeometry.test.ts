import assert from 'assert';
import { test } from 'node:test';
import { estimatePilasterCount } from './partitionLayoutGeometry.ts';

test('linear pilasters: n+1 for n>0', () => {
  const r = estimatePilasterCount({
    shape: 'linear',
    totalCompartments: 4,
    lLegA: 0,
    lLegB: 0,
    uLegA: 0,
    uLegB: 0,
    uLegC: 0,
  });
  assert.equal(r.count, 5);
  assert.match(r.formula, /n\+1/);
});

test('L-shape shares one corner pilaster', () => {
  const r = estimatePilasterCount({
    shape: 'l_shape',
    totalCompartments: 4,
    lLegA: 2,
    lLegB: 2,
    uLegA: 0,
    uLegB: 0,
    uLegC: 0,
  });
  assert.equal(r.count, 2 + 1 + 2 + 1 - 1);
  assert.equal(r.count, 5);
});

test('U-shape with three legs', () => {
  const r = estimatePilasterCount({
    shape: 'u_shape',
    totalCompartments: 5,
    uLegA: 1,
    uLegB: 2,
    uLegC: 2,
    lLegA: 0,
    lLegB: 0,
  });
  // LINEAR(1)+LINEAR(2)+LINEAR(2) - 2 = 2+3+3-2
  assert.equal(r.count, 2 + 3 + 3 - 2);
  assert.equal(r.count, 6);
});

test('U-shape legs zero falls back to linear for n>0', () => {
  const r = estimatePilasterCount({
    shape: 'u_shape',
    totalCompartments: 3,
    lLegA: 0,
    lLegB: 0,
    uLegA: 0,
    uLegB: 0,
    uLegC: 0,
  });
  assert.equal(r.count, 4);
});
