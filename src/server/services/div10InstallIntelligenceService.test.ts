import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFallbackInstallIntelligenceWorkbook } from './div10InstallIntelligenceFallback.ts';
import {
  applyInstallModifiers,
  getProposalClauses,
  getQuestionsForLine,
  resolveInstallIntelligenceFromWorkbook,
  resolveVendorAlias,
  runReviewRules,
  setActiveInstallIntelligenceWorkbookForTests,
} from './div10InstallIntelligenceService.ts';
import type { LineFacts, ProjectAssumptions } from '../../shared/types/div10InstallIntelligence.ts';

const wb = buildFallbackInstallIntelligenceWorkbook();

test.before(() => {
  setActiveInstallIntelligenceWorkbookForTests(wb);
});

function lineFacts(partial: Partial<LineFacts> & Pick<LineFacts, 'description'>): LineFacts {
  return {
    description: partial.description,
    category: partial.category ?? null,
    categoryKey: partial.categoryKey ?? '',
    laborFamily: partial.laborFamily ?? null,
    unit: partial.unit ?? 'EA',
    qty: partial.qty ?? 1,
    vendorName: partial.vendorName ?? null,
    sku: partial.sku ?? null,
    rowType: partial.rowType ?? 'material',
    sourceType: partial.sourceType,
    catalogLaborMinutes: partial.catalogLaborMinutes,
    assumptions: partial.assumptions ?? {},
  };
}

test('grab bar requires blocking question', () => {
  const questions = getQuestionsForLine('grab_bar', null, wb);
  assert.ok(questions.some((q) => q.fieldKey === 'blocking_status'));
  assert.ok(questions.some((q) => /blocking/i.test(q.prompt)));
});

test('tile wall applies labor modifier', () => {
  const facts = lineFacts({
    description: 'Bobrick 36 inch grab bar',
    categoryKey: 'grab_bar',
    laborFamily: 'grab_bar_install',
    assumptions: { wall_substrate: 'tile' },
  });
  const mod = applyInstallModifiers(facts, { wallSubstrate: 'tile' }, 30, wb);
  assert.ok(mod.minutes > 30);
});

test('project blocking_status included unlocks grab bar labor', () => {
  const facts = lineFacts({
    description: 'Bobrick grab bar',
    categoryKey: 'grab_bar',
    laborFamily: 'grab_bar_install',
    assumptions: {},
  });
  const resolved = resolveInstallIntelligenceFromWorkbook(wb, {
    lineFacts: facts,
    projectAssumptions: { blocking_status: 'included' },
  });
  assert.ok(resolved.laborMinutes > 0);
  assert.equal(resolved.blockAutoPriceLabor, false);
  assert.ok(!resolved.reviewFlags.includes('blocking_unknown'));
});

test('line blocking_status overrides project blocking_status', () => {
  const facts = lineFacts({
    description: 'Bobrick grab bar',
    categoryKey: 'grab_bar',
    laborFamily: 'grab_bar_install',
    assumptions: { blocking_status: 'unknown' },
  });
  const resolved = resolveInstallIntelligenceFromWorkbook(wb, {
    lineFacts: facts,
    projectAssumptions: { blocking_status: 'included' },
  });
  assert.equal(resolved.laborMinutes, 0);
  assert.ok(resolved.reviewFlags.includes('blocking_unknown'));
});

test('unknown blocking triggers review and blocks auto-price', () => {
  const facts = lineFacts({
    description: 'Bobrick grab bar',
    categoryKey: 'grab_bar',
    laborFamily: 'grab_bar_install',
    assumptions: { blocking_status: 'unknown' },
  });
  const review = runReviewRules(facts, undefined, wb);
  assert.equal(review.needsReview, true);
  assert.equal(review.blockAutoPriceLabor, true);
  assert.ok(review.reviewFlags.includes('blocking_unknown'));

  const resolved = resolveInstallIntelligenceFromWorkbook(wb, { lineFacts: facts });
  assert.equal(resolved.laborMinutes, 0);
  assert.equal(resolved.needsReview, true);
});

test('recessed accessory adds labor and review flag', () => {
  const facts = lineFacts({
    description: 'Semi-recessed soap dispenser',
    categoryKey: 'recessed_accessory',
    laborFamily: 'toilet_accessory_install',
    assumptions: { rough_opening_responsibility: 'gc' },
  });
  const mod = applyInstallModifiers(facts, undefined, 20, wb);
  assert.ok(mod.minutes > 20);
  assert.ok(mod.reviewFlags.includes('recessed_install_review'));
});

test('partition missing compartments blocks auto-price', () => {
  const facts = lineFacts({
    description: 'Toilet partition headrail',
    categoryKey: 'partition',
    laborFamily: 'partition_install',
    assumptions: {},
  });
  const resolved = resolveInstallIntelligenceFromWorkbook(wb, { lineFacts: facts });
  assert.equal(resolved.blockAutoPriceLabor, true);
  assert.equal(resolved.laborMinutes, 0);
  assert.ok(resolved.reviewFlags.some((f) => /partition/i.test(f)));
});

test('locker knocked-down applies modifier', () => {
  const facts = lineFacts({
    description: 'Single tier locker',
    categoryKey: 'locker',
    laborFamily: 'locker_install',
    assumptions: { locker_kd_status: 'knocked_down', locker_openings: '2' },
  });
  const mod = applyInstallModifiers(facts, undefined, 45, wb);
  assert.ok(mod.minutes > 45);
  assert.ok(mod.reviewFlags.includes('locker_kd_review'));
});

test('vendor alias normalizes FBM / L&W / GMS', () => {
  assert.equal(resolveVendorAlias('ferguson', wb), 'FBM');
  assert.equal(resolveVendorAlias('L&W Supply', wb), 'L&W Supply');
  assert.equal(resolveVendorAlias('gypsum supply', wb), 'GMS');
});

test('proposal clauses generated; internal review flags not in customer clauses', () => {
  const facts = lineFacts({
    description: 'Grab bar satin',
    categoryKey: 'grab_bar',
    laborFamily: 'grab_bar_install',
    assumptions: { wall_substrate: 'tile', blocking_status: 'unknown' },
  });
  const review = runReviewRules(facts, { wallSubstrate: 'tile' } as ProjectAssumptions, wb);
  const clauses = getProposalClauses(facts, { wallSubstrate: 'tile' }, review.reviewFlags, wb);

  assert.ok(clauses.some((c) => /tile/i.test(c.clientText)));
  assert.ok(clauses.every((c) => !c.internalOnly));
  assert.ok(!clauses.some((c) => /blocking_unknown/i.test(c.clientText)));

  const resolved = resolveInstallIntelligenceFromWorkbook(wb, {
    lineFacts: facts,
    projectAssumptions: { wallSubstrate: 'tile' },
  });
  assert.ok(resolved.proposalClauses.length > 0);
  assert.ok(resolved.reviewFlags.includes('blocking_unknown'));
});
