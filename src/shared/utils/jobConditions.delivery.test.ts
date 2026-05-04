import test from 'node:test';
import assert from 'node:assert/strict';
import { recommendDeliveryPlan } from './jobConditions.ts';

test('recommendDeliveryPlan: under 50 mi no delivery charge', () => {
  assert.deepEqual(recommendDeliveryPlan(25), {
    deliveryRequired: false,
    deliveryPricingMode: 'included',
    deliveryValue: 0,
    deliveryLeadDays: 0,
    deliveryQuotedSeparately: false,
  });
});

test('recommendDeliveryPlan: 50–100 mi is $100 flat', () => {
  const a = recommendDeliveryPlan(50);
  assert.equal(a.deliveryRequired, true);
  assert.equal(a.deliveryPricingMode, 'flat');
  assert.equal(a.deliveryValue, 100);
  assert.equal(a.deliveryQuotedSeparately, false);

  const b = recommendDeliveryPlan(100);
  assert.equal(b.deliveryValue, 100);
  assert.equal(b.deliveryQuotedSeparately, false);
});

test('recommendDeliveryPlan: over 100 mi is priced separately with no flat fee', () => {
  const r = recommendDeliveryPlan(101);
  assert.equal(r.deliveryRequired, true);
  assert.equal(r.deliveryPricingMode, 'included');
  assert.equal(r.deliveryValue, 0);
  assert.equal(r.deliveryQuotedSeparately, true);
  assert.ok(r.deliveryLeadDays >= 1);
});
