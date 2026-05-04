import assert from 'node:assert';
import { test } from 'node:test';
import {
  parseGroundingAddressFromModelText,
  shouldAttemptMapsGroundingForAddress,
} from './mapsGroundingLiteService.ts';

test('shouldAttemptMapsGroundingForAddress true when empty', () => {
  assert.strictEqual(shouldAttemptMapsGroundingForAddress(''), true);
});

test('shouldAttemptMapsGroundingForAddress false when US zip present and long enough', () => {
  assert.strictEqual(shouldAttemptMapsGroundingForAddress('100 Main St, Springfield, IL 62701'), false);
});

test('parseGroundingAddressFromModelText reads first line and MAPS_LINK', () => {
  const r = parseGroundingAddressFromModelText(
    '400 Broad St, Seattle, WA 98109\nMAPS_LINK: https://www.google.com/maps/place/?q=place'
  );
  assert.strictEqual(r.addressLine, '400 Broad St, Seattle, WA 98109');
  assert.ok(r.placeUrl?.includes('google.com/maps'));
});

test('parseGroundingAddressFromModelText handles ADDRESS_UNAVAILABLE', () => {
  const r = parseGroundingAddressFromModelText('ADDRESS_UNAVAILABLE');
  assert.strictEqual(r.addressLine, '');
});
