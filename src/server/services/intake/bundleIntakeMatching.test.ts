import test from 'node:test';
import assert from 'node:assert/strict';
import type { BundleRecord } from '../../../shared/types/estimator.ts';
import { prepareBundleMatch, scoreBundleForIntakeLine } from './bundleIntakeMatching.ts';

const sampleBundles: BundleRecord[] = [
  {
    id: 'b1',
    bundleName: "Men's Restroom Accessory Bundle",
    category: 'Toilet Accessories',
    active: true,
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'b2',
    bundleName: 'Locker Room Starter',
    category: 'Lockers',
    active: true,
    updatedAt: new Date().toISOString(),
  },
];

test('room name overlapping bundle name yields strong bundle match', () => {
  const input = {
    roomName: "Men's Restroom Accessory Package",
    itemName: 'Typical accessories',
    description: 'Typical men toilet room accessories per ADA',
    category: 'Toilet Accessories',
    bundleCandidates: ['restroom-accessories'],
  };
  const score = scoreBundleForIntakeLine(input, sampleBundles[0]!);
  assert.ok(score >= 0.45, `expected high score, got ${score}`);
  const { bundleMatch, suggestedBundle } = prepareBundleMatch(input, sampleBundles);
  assert.ok(bundleMatch || suggestedBundle, 'expected a bundle suggestion');
});

test('locker room + KD line aligns with locker bundle', () => {
  const input = {
    roomName: 'Locker Room A',
    itemName: 'Metal lockers',
    description: 'Metal lockers three tier KD assemble on site',
    category: 'Lockers',
    bundleCandidates: ['locker-room-starter'],
  };
  const { bundleMatch, suggestedBundle } = prepareBundleMatch(input, sampleBundles);
  assert.ok(bundleMatch || suggestedBundle);
});

test('unrelated electrical line does not strong-match restroom bundle', () => {
  const input = {
    roomName: 'Electrical',
    itemName: 'Coordination',
    description: 'Coordination only not in our scope',
    category: 'Other',
    bundleCandidates: [],
  };
  const { bundleMatch } = prepareBundleMatch(input, sampleBundles);
  assert.equal(bundleMatch, null);
});
