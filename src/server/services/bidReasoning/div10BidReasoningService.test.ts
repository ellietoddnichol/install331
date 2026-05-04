import test from 'node:test';
import assert from 'node:assert/strict';
import {
  appendDiv10InstallHintsToLineNotes,
  buildIntakeReasoningEnvelopeForLine,
  classifyDiv10ParserBlockType,
  findDiv10InstallObjectHints,
  inferBidReasoningAssumptionsFromDocumentText,
  matchesDiv10CommercialOrMetadataLine,
  normalizeGeminiParserBlockType,
} from './div10BidReasoningService.ts';

test('matchesDiv10CommercialOrMetadataLine flags bond, tax, labor-quote, site visit', () => {
  assert.equal(matchesDiv10CommercialOrMetadataLine('BOND: NO'), true);
  assert.equal(matchesDiv10CommercialOrMetadataLine('ADD FOR SALES TAX'), true);
  assert.equal(matchesDiv10CommercialOrMetadataLine('IF LABOR IS NEEDED, PLEASE CALL FOR QUOTE'), true);
  assert.equal(matchesDiv10CommercialOrMetadataLine('JOB SITE VISIT: NO'), true);
  assert.equal(matchesDiv10CommercialOrMetadataLine('CUSTOMER TO RECEIVE/UNLOAD'), true);
});

test('matchesDiv10CommercialOrMetadataLine does not flag typical scope lines', () => {
  assert.equal(matchesDiv10CommercialOrMetadataLine('2 EA Bobrick B6806 grab bar 36 inch'), false);
  assert.equal(matchesDiv10CommercialOrMetadataLine('14 EA Hadrian partition stall floor mounted overhead braced'), false);
});

test('inferBidReasoningAssumptionsFromDocumentText extracts key commercial clauses', () => {
  const text = `
    JOB SITE VISIT: NO
    IF LABOR IS NEEDED PLEASE CALL FOR QUOTE
    CUSTOMER TO RECEIVE/UNLOAD
  `;
  const a = inferBidReasoningAssumptionsFromDocumentText(text);
  const kinds = new Set(a.map((x) => x.kind));
  assert.equal(kinds.has('site_visit'), true);
  assert.equal(kinds.has('pricing_basis'), true);
  assert.equal(kinds.has('delivery'), true);
});

test('findDiv10InstallObjectHints matches grab bar and locker language', () => {
  const g = findDiv10InstallObjectHints('2 sets swing-up grab bar 18 inch');
  assert.ok(g.some((h) => h.objectId === 'grab_bars'));
  const l = findDiv10InstallObjectHints('phenolic locker bank with filler panel');
  assert.ok(l.some((h) => h.objectId === 'lockers'));
});

test('appendDiv10InstallHintsToLineNotes adds tag and note', () => {
  const out = appendDiv10InstallHintsToLineNotes('semi-recessed fire cabinet model C10', '', []);
  assert.ok(out.notes.includes('Bid reasoning'));
  assert.ok(out.semanticTags.includes('div10_install_intel'));
});

test('classifyDiv10ParserBlockType tags commercial vs scope', () => {
  assert.equal(classifyDiv10ParserBlockType('IF LABOR IS NEEDED, PLEASE CALL FOR QUOTE'), 'commercial_term');
  assert.equal(classifyDiv10ParserBlockType('JOB SITE VISIT: NO'), 'commercial_term');
  assert.equal(classifyDiv10ParserBlockType('2 EA Hadrian partition stall'), 'scope_item');
});

test('normalizeGeminiParserBlockType accepts aliases', () => {
  assert.equal(normalizeGeminiParserBlockType('CommercialTerm'), 'commercial_term');
  assert.equal(normalizeGeminiParserBlockType('scope-item'), 'scope_item');
});

test('buildIntakeReasoningEnvelopeForLine preserves non-scope meaning on commercial lines', () => {
  const env = buildIntakeReasoningEnvelopeForLine({
    description: 'IF LABOR IS NEEDED, PLEASE CALL FOR QUOTE',
  });
  assert.equal(env.parser_block_type, 'commercial_term');
  assert.equal(env.non_scope_meaning?.proposal_scope_type, 'material_only');
  assert.ok((env.confidence_adjustments?.scopeCompletenessPenalty ?? 0) > 0);
  assert.ok(env.crew_recommendation?.bump_factors?.some((b) => /labor|quote|site/i.test(b)));
});

test('buildIntakeReasoningEnvelopeForLine combines install objects and semantic intents (multi-hit)', () => {
  const env = buildIntakeReasoningEnvelopeForLine({
    description: 'lockers on wood bases with end panels',
  });
  assert.ok(env.install_object_ids?.includes('lockers'));
  assert.ok(env.install_object_ids?.includes('locker_base_carpentry'));
  assert.ok(env.labor_recipe_candidates?.length);
  assert.ok(
    env.crew_recommendation?.install_family === 'locker_system' ||
      env.crew_recommendation?.install_family === 'locker_base_carpentry'
  );
  const crew = env.crew_recommendation?.recommended_crew ?? env.crew_recommendation?.suggested_crew_size;
  assert.ok(crew != null && crew >= 3, `expected crew >= 3 for wood base + fillers, got ${crew}`);
  assert.ok(env.crew_recommendation?.default_crew === 2);
  assert.ok(env.crew_recommendation?.crew_bump_factor_ids?.includes('wood_base_with_locker_set'));
});

test('crew sizing bumps grab bars on tile substrate', () => {
  const env = buildIntakeReasoningEnvelopeForLine({
    description: '2 ea bobrick grab bars on tile wall',
  });
  const crew = env.crew_recommendation?.recommended_crew ?? env.crew_recommendation?.suggested_crew_size;
  assert.ok(crew != null && crew >= 2);
});

test('small accessory line defaults to 1 installer', () => {
  const env = buildIntakeReasoningEnvelopeForLine({
    description: '6 ea soap dispenser surface mount',
  });
  assert.equal(env.crew_recommendation?.default_crew, 1);
  assert.equal(env.crew_recommendation?.recommended_crew, 1);
});

test('buildIntakeReasoningEnvelopeForLine applies semi-recessed hidden-scope bump without wall cue', () => {
  const env = buildIntakeReasoningEnvelopeForLine({
    description: 'semi-recessed fire cabinet model C10',
  });
  assert.ok((env.confidence_adjustments?.hiddenScopeRiskScore ?? 0) > 0);
});
