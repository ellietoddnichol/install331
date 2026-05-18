import test from 'node:test';
import assert from 'node:assert/strict';
import {
  appendScopeExclusionNote,
  parseScopeExclusionFromNotes,
} from './exclusionReasonLabels.ts';

test('scope exclusion note round-trips in line notes', () => {
  const merged = appendScopeExclusionNote('Vendor row note', {
    action: 'exclude_from_estimate',
    reason: 'freight_note',
    note: 'Carrier fee only',
  });
  const parsed = parseScopeExclusionFromNotes(merged);
  assert.equal(parsed?.action, 'exclude_from_estimate');
  assert.equal(parsed?.reason, 'freight_note');
  assert.equal(parsed?.note, 'Carrier fee only');
  assert.match(merged, /Vendor row note/);
});

test('appendScopeExclusionNote replaces prior exclusion marker', () => {
  const first = appendScopeExclusionNote(null, {
    action: 'hide_from_proposal',
    reason: 'duplicate',
  });
  const second = appendScopeExclusionNote(first, {
    action: 'hide_from_proposal',
    reason: 'alternate',
    note: 'Alt scope',
  });
  assert.equal(parseScopeExclusionFromNotes(second)?.reason, 'alternate');
  assert.doesNotMatch(second, /reason=duplicate/);
});
