import test from 'node:test';
import assert from 'node:assert/strict';
import {
  coerceSafeProjectName,
  isPlausibleCustomerFacingProposalText,
  isPlausibleProjectTitle,
  isPlausibleProposalScopeSnippet,
  looksLikeIntakeContactOrNonScopeLine,
  looksLikeIntakePricingSummaryOrDisclaimerLine,
  looksLikeIntakeSectionHeaderOrTitleLine,
} from './intakeTextGuards.ts';

test('looksLikeIntakeSectionHeaderOrTitleLine flags column headers and short division headings', () => {
  assert.equal(looksLikeIntakeSectionHeaderOrTitleLine('Item'), true);
  assert.equal(looksLikeIntakeSectionHeaderOrTitleLine('Qty Description Unit'), true);
  assert.equal(looksLikeIntakeSectionHeaderOrTitleLine('Division 10 — toilet accessories'), true);
  assert.equal(looksLikeIntakeSectionHeaderOrTitleLine('SCOPE OF WORK'), true);
  assert.equal(looksLikeIntakeSectionHeaderOrTitleLine('4 EA Stainless grab bar 36 inch'), false);
  assert.equal(
    looksLikeIntakeSectionHeaderOrTitleLine(
      'Division 10 furnish and install accessories per plans and specifications throughout'
    ),
    false
  );
});

test('proposal scope snippets exclude table header ribbons', () => {
  assert.equal(isPlausibleProposalScopeSnippet('Qty Description Unit'), false);
  assert.equal(isPlausibleProposalScopeSnippet('ITEM'), false);
});

test('looksLikeIntakeContactOrNonScopeLine drops letterhead, contact, and form junk', () => {
  assert.equal(looksLikeIntakeContactOrNonScopeLine('CWA Specialties Inc.'), true);
  assert.equal(looksLikeIntakeContactOrNonScopeLine('182'), true);
  assert.equal(looksLikeIntakeContactOrNonScopeLine('Linwood, KS 66052'), true);
  assert.equal(looksLikeIntakeContactOrNonScopeLine('913-526-9834'), true);
  assert.equal(looksLikeIntakeContactOrNonScopeLine('latina@cwaspecialties.com'), true);
  assert.equal(
    looksLikeIntakeContactOrNonScopeLine('days of proposal date with approved submittals'),
    true
  );
  assert.equal(looksLikeIntakeContactOrNonScopeLine("Quantity's Material"), true);
  assert.equal(looksLikeIntakeContactOrNonScopeLine('BOND: Y / N'), true);
  assert.equal(looksLikeIntakeContactOrNonScopeLine('4 EA Stainless grab bar 36 inch'), false);
  assert.equal(looksLikeIntakeContactOrNonScopeLine('Partition Systems LLC furnish per plans'), false);
});

test('looksLikeIntakePricingSummaryOrDisclaimerLine drops totals and labor/quote disclaimers', () => {
  assert.equal(looksLikeIntakePricingSummaryOrDisclaimerLine('Material: $2765'), true);
  assert.equal(looksLikeIntakePricingSummaryOrDisclaimerLine('Labor: $1,200.00'), true);
  assert.equal(looksLikeIntakePricingSummaryOrDisclaimerLine('Subtotal: $4,000'), true);
  assert.equal(looksLikeIntakePricingSummaryOrDisclaimerLine('IF LABOR IS NEEDED, PLEASE CALL FOR QUOTE'), true);
  assert.equal(looksLikeIntakePricingSummaryOrDisclaimerLine('Please call our office for pricing on labor.'), true);
  assert.equal(looksLikeIntakePricingSummaryOrDisclaimerLine('4 EA Stainless grab bar 36 inch'), false);
  assert.equal(looksLikeIntakePricingSummaryOrDisclaimerLine('Material hoist 1 ton per plans'), false);
});

test('isPlausibleProjectTitle accepts real warehouse-style job names', () => {
  assert.equal(isPlausibleProjectTitle('Black & McDonald Warehouse'), true);
  assert.equal(isPlausibleProjectTitle('K-12 Modernization'), true);
});

test('coerceSafeProjectName replaces mojibake with fallback', () => {
  assert.equal(coerceSafeProjectName('F¼Æ"%1Ð½zÎÔ¹ùÝkfWp·+P$nWà`Ó', 'Imported Project'), 'Imported Project');
  assert.equal(coerceSafeProjectName('Black & McDonald Warehouse', 'Imported Project'), 'Black & McDonald Warehouse');
});

test('proposal scope snippets stay readable; customer-facing blocks stay strict on mixed garbage', () => {
  const soup =
    'en; 9|5¹ÿf÷ï®ÇÛ[ÅXk@ÆI*¢<; 8XV,ô{t:%¥sSf+£ùrùeÆÒ6_âÃîÌ]uå2¤ÙÂØÛÈ¶¹ÚªaÜüPÚu¬§<$cÂÕ{;ZÔÎÌÞ;°ÅÁ&vtS®Á«2s»-v;';
  assert.equal(isPlausibleCustomerFacingProposalText(`Scope appears to include ${soup}`), false);
  assert.equal(isPlausibleProposalScopeSnippet('4 EA Stainless grab bar 36 inch'), true);
  assert.equal(
    isPlausibleCustomerFacingProposalText('Furnish and install Division 10 per bid documents and field conditions.'),
    true
  );
});
