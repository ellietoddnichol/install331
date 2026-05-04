/**
 * One-off verification harness for the intake partition/install pipeline overhaul.
 *
 * Runs the Lewis & Clark PDF through the full intake pipeline and reports:
 *   1. Section context inheritance and install-family labor propagation through finalize.
 *   2. Material-only pricing mode: banner should fire, generated labor should be excluded.
 *   3. Grab bar set bundle expansion multiplication.
 *
 * Then prints representative rows for: partition compartment without SKU, urinal screen,
 * grab bar set expansion.
 *
 * Run: npx tsx scripts/verify-lewis-clark-intake.ts
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parsePdfUpload } from '../src/server/services/intake/pdfParser.ts';
import { normalizePdfLinesDeterministically } from '../src/server/services/intake/normalizer.ts';
import { toReviewLines } from '../src/server/services/matchPreparationService.ts';
import { buildIntakeEstimateDraft } from '../src/server/services/intakeMatcherService.ts';
import type { CatalogItem } from '../src/types.ts';
import { expandBundleLines } from '../src/server/services/intake/bundleRowExpander.ts';
import { evaluateInstallability } from '../src/server/services/intake/installabilityRules.ts';
import { getInstallLaborFamily } from '../src/server/services/intake/installLaborFamilies.ts';
import { computeDraftBasisSummary } from '../src/shared/utils/intakeEstimateReview.ts';
import type { NormalizedIntakeItem } from '../src/shared/types/intake.ts';
import type { NormalizedIntakeLine } from '../src/server/services/spreadsheetInterpreterService.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const PDF_PATH = 'C:\\Users\\ellie\\Downloads\\LPS Lewis & Clark (1).pdf';

function summarize(s: string, max = 110): string {
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

function pdfItemToNormalizedLine(item: NormalizedIntakeItem, index: number): NormalizedIntakeLine {
  return {
    roomName: item.roomName || 'General Scope',
    category: item.category || '',
    itemCode: '',
    itemName: item.description,
    description: item.description,
    quantity: item.quantity ?? 1,
    unit: item.unit || 'EA',
    notes: (item.notes || []).join(' '),
    sourceReference: `${item.sourceRef.fileName}#${index}`,
    laborIncluded: null,
    materialIncluded: null,
    confidence: item.confidence,
    parserTag: 'pdf-deterministic',
    warnings: [],
    sourceManufacturer: item.sourceManufacturer,
    sourceBidBucket: item.sourceBidBucket,
    sourceSectionHeader: item.sourceSectionHeader,
    isInstallableScope: item.isInstallableScope,
    installScopeType: item.installScopeType ?? null,
  };
}

async function main() {
  if (!fs.existsSync(PDF_PATH)) {
    console.error(`[fatal] PDF not found at ${PDF_PATH}`);
    process.exit(1);
  }

  const pdfBytes = fs.readFileSync(PDF_PATH);
  console.log(`Loaded PDF: ${PDF_PATH} (${pdfBytes.length} bytes)\n`);

  const pdf = await parsePdfUpload({
    fileName: 'LPS Lewis & Clark (1).pdf',
    mimeType: 'application/pdf',
    dataBase64: pdfBytes.toString('base64'),
  });

  console.log(`Pages: ${pdf.document.pages.length}, chunks: ${pdf.chunks.length}`);
  console.log(`Metadata projectName: ${pdf.metadata.projectName || '(none)'}`);
  console.log(`Metadata pricingBasis: ${pdf.metadata.pricingBasis || '(none)'}\n`);

  // --- 1. Inspect raw deterministic items: verify section context population ---
  const items = normalizePdfLinesDeterministically({
    fileName: 'LPS Lewis & Clark (1).pdf',
    chunks: pdf.chunks,
  });
  console.log(`Deterministic normalized items: ${items.length}`);
  console.log('--- raw item dump ---');
  for (let i = 0; i < items.length; i += 1) {
    const it = items[i];
    console.log(`  [${i}] qty=${it.quantity} unit=${it.unit} | desc="${summarize(it.description, 90)}" | mfr=${it.sourceManufacturer ?? '-'} | bid=${it.sourceBidBucket ?? '-'} | install=${it.isInstallableScope ? it.installScopeType : 'no'}`);
  }
  console.log('---');


  const sectionHeaderSet = new Set<string>();
  const manufacturerSet = new Set<string>();
  const bidBucketSet = new Set<string>();
  for (const it of items) {
    if (it.sourceSectionHeader) sectionHeaderSet.add(it.sourceSectionHeader);
    if (it.sourceManufacturer) manufacturerSet.add(it.sourceManufacturer);
    if (it.sourceBidBucket) bidBucketSet.add(it.sourceBidBucket);
  }
  console.log(`Unique section headers detected: ${sectionHeaderSet.size}`);
  for (const h of sectionHeaderSet) console.log(`   • ${h}`);
  console.log(`Unique manufacturers: ${Array.from(manufacturerSet).join(', ') || '(none)'}`);
  console.log(`Unique bid buckets: ${Array.from(bidBucketSet).join(', ') || '(none)'}\n`);

  // --- 2. Run through matchPreparation (bundle expansion + install-family fallback) ---
  const normalizedLines = items.map(pdfItemToNormalizedLine);
  const expanded = expandBundleLines(normalizedLines as Parameters<typeof expandBundleLines>[0]);
  const bundleExpansionCount = expanded.length - normalizedLines.length;
  console.log(`Normalized lines: ${normalizedLines.length}`);
  console.log(`After bundle expansion: ${expanded.length} (added ${bundleExpansionCount})\n`);

  const reviewLines = toReviewLines(normalizedLines, [], false, []);
  console.log(`Review lines: ${reviewLines.length}`);

  const installableReviewLines = reviewLines.filter((r) => r.isInstallableScope);
  const withFallback = reviewLines.filter((r) => r.installFamilyFallback);
  console.log(`  isInstallableScope=true rows: ${installableReviewLines.length}`);
  console.log(`  with installFamilyFallback: ${withFallback.length}\n`);

  // Group installable rows by scope type
  const byScopeType = new Map<string, typeof reviewLines>();
  for (const r of reviewLines) {
    if (!r.isInstallableScope) continue;
    const key = r.installScopeType || '(unknown)';
    const arr = byScopeType.get(key) || [];
    arr.push(r);
    byScopeType.set(key, arr);
  }
  console.log(`Install scope type breakdown:`);
  for (const [key, arr] of Array.from(byScopeType.entries()).sort((a, b) => b[1].length - a[1].length)) {
    console.log(`  ${key}: ${arr.length} row(s)`);
  }
  console.log();

  // --- 3. Run the matcher to build IntakeLineEstimateSuggestion rows ---
  // Minimal dummy catalog so buildIntakeEstimateDraft does not early-return (no real matches expected).
  const dummyCatalog: CatalogItem[] = [
    {
      id: 'dummy',
      sku: 'DUMMY',
      category: 'Toilet Accessories',
      description: 'Dummy catalog entry for verification harness',
      uom: 'EA',
      baseMaterialCost: 0,
      baseLaborMinutes: 0,
      taxable: false,
      adaFlag: false,
      active: true,
      installLaborFamily: null,
    },
  ];
  const draft = buildIntakeEstimateDraft({
    reviewLines,
    catalog: dummyCatalog,
    modifiers: [],
    intakeAutomation: { mode: 'preselect_only', tierAMinScore: 0.82 },
  });
  if (!draft) {
    console.error('[fatal] buildIntakeEstimateDraft returned undefined');
    process.exit(1);
  }
  const suggestions = draft.lineSuggestions;
  const lineByFingerprint: Record<string, {
    selectedCatalogItemId: string | null;
    applicationStatus: 'suggested' | 'accepted' | 'replaced' | 'ignored';
    selectedBundleId: string | null;
  }> = {};
  for (const s of suggestions) {
    lineByFingerprint[s.reviewLineFingerprint] = {
      selectedCatalogItemId: s.suggestedCatalogItemId,
      applicationStatus: s.applicationStatus,
      selectedBundleId: null,
    };
  }

  // Force-accept installable rows so their labor shows up in the draft total (simulating user accept)
  for (const s of suggestions) {
    if (s.isInstallableScope && s.pricingPreview) {
      lineByFingerprint[s.reviewLineFingerprint].applicationStatus = 'accepted';
    }
  }

  const laborAndMaterialSummary = computeDraftBasisSummary(draft, lineByFingerprint, null, {
    pricingMode: 'labor_and_material',
  });
  const materialOnlySummary = computeDraftBasisSummary(draft, lineByFingerprint, null, {
    pricingMode: 'material_only',
  });

  console.log('--- VERIFICATION #4: bid-split detection and per-bucket totals ---');
  console.log(`  hasBidSplits: ${laborAndMaterialSummary.hasBidSplits}`);
  console.log(`  byBidBucket (${laborAndMaterialSummary.byBidBucket.length} buckets):`);
  for (const b of laborAndMaterialSummary.byBidBucket) {
    console.log(
      `     • ${b.label.padEnd(14)} kind=${b.kind.padEnd(11)} lines=${b.totalLines} accepted=${b.acceptedPricedLines} material=$${b.materialSubtotalPreview.toFixed(2)} laborMin=${b.laborMinutesSubtotalPreview.toFixed(1)} inPrimary=${b.includedInPrimaryTotals ? 'YES' : 'no'}`
    );
  }
  const primaryLabor = laborAndMaterialSummary.laborMinutesSubtotalPreview;
  const altLabor = laborAndMaterialSummary.byBidBucket
    .filter((b) => !b.includedInPrimaryTotals)
    .reduce((s, b) => s + b.laborMinutesSubtotalPreview, 0);
  console.log(`  Primary draft labor (min): ${primaryLabor.toFixed(1)}`);
  console.log(`  Alternate (excluded) labor (min): ${altLabor.toFixed(1)}`);

  // Flip the toggle: include all buckets → primary should now match primary + alt.
  const allBucketsIncluded = new Set(laborAndMaterialSummary.byBidBucket.map((b) => b.key));
  const allIncludedSummary = computeDraftBasisSummary(draft, lineByFingerprint, null, {
    pricingMode: 'labor_and_material',
    bidBucketsIncluded: allBucketsIncluded,
  });
  console.log(`  With ALL buckets included, primary labor: ${allIncludedSummary.laborMinutesSubtotalPreview.toFixed(1)} (should equal primary + alt: ${(primaryLabor + altLabor).toFixed(1)})`);
  console.log();

  console.log('--- VERIFICATION #1: section context + install-family persistence through finalize ---');
  console.log(`  partition_compartment rows: ${(byScopeType.get('partition_compartment') || []).length}`);
  console.log(`  urinal_screen rows: ${(byScopeType.get('urinal_screen') || []).length}`);
  console.log(`  rows with install_family fallback: ${withFallback.length}`);
  console.log(`  suggestions carrying install-family labor in pricingPreview: ${suggestions.filter((s) => s.pricingPreview?.laborFromInstallFamily).length}`);
  console.log(`  suggestions with laborOrigin === 'install_family': ${suggestions.filter((s) => s.laborOrigin === 'install_family').length}\n`);

  console.log('--- VERIFICATION #2: material-only pricing mode suppresses generated labor ---');
  console.log(`  labor_and_material draft labor minutes:   ${laborAndMaterialSummary.laborMinutesSubtotalPreview.toFixed(1)}`);
  console.log(`  material_only     draft labor minutes:   ${materialOnlySummary.laborMinutesSubtotalPreview.toFixed(1)}`);
  console.log(
    `  generated labor correctly suppressed in material_only: ${
      materialOnlySummary.laborMinutesSubtotalPreview < laborAndMaterialSummary.laborMinutesSubtotalPreview
        ? 'YES'
        : 'NO (check)'
    }`
  );
  console.log(
    `  banner will fire in UI: ${suggestions.some((s) => s.pricingPreview?.laborFromInstallFamily) ? 'YES' : 'NO'}\n`
  );

  console.log('--- VERIFICATION #3: grab bar set bundle expansion multiplication ---');
  const grabBarParents = normalizedLines.filter((l) => /grab\s*bar\s*set\s*[:\-]/i.test(l.description));
  const grabBarChildren = reviewLines.filter((r) => /grab bar \d+"/i.test(r.description));
  console.log(`  grab bar set parent lines (pre-expansion): ${grabBarParents.length}`);
  for (const p of grabBarParents) {
    console.log(`    parent: qty=${p.quantity} unit=${p.unit} desc=${summarize(p.description, 80)}`);
  }
  console.log(`  grab bar child lines (post-expansion, by size):`);
  const bySize = new Map<string, number>();
  for (const c of grabBarChildren) {
    const sizeMatch = c.description.match(/(\d{2})"/);
    const key = sizeMatch ? `${sizeMatch[1]}"` : '?';
    bySize.set(key, (bySize.get(key) || 0) + c.quantity);
  }
  for (const [k, v] of Array.from(bySize.entries()).sort()) {
    console.log(`    ${k}: ${v} units (across ${grabBarChildren.filter((c) => c.description.includes(k)).length} child row(s))`);
  }
  console.log();

  console.log('=== EXAMPLE ROWS ===\n');

  function printExample(label: string, reviewLine: typeof reviewLines[number]) {
    const suggestion = suggestions.find((s) => s.reviewLineFingerprint === reviewLine.reviewLineFingerprint);
    const family = getInstallLaborFamily(reviewLine.installScopeType || null);
    console.log(`--- ${label} ---`);
    console.log(`  description         : ${summarize(reviewLine.description, 120)}`);
    console.log(`  quantity            : ${reviewLine.quantity} ${reviewLine.unit}`);
    console.log(`  sourceManufacturer  : ${reviewLine.sourceManufacturer ?? '(none)'}`);
    console.log(`  sourceBidBucket     : ${reviewLine.sourceBidBucket ?? '(none)'}`);
    console.log(`  sourceSectionHeader : ${reviewLine.sourceSectionHeader ?? '(none)'}`);
    console.log(`  isInstallableScope  : ${reviewLine.isInstallableScope ?? false}`);
    console.log(`  installScopeType    : ${reviewLine.installScopeType ?? '(none)'}`);
    if (family) {
      console.log(`  install family      : ${family.key} (${family.label})`);
      console.log(`     default minutes  : ${family.defaultInstallMinutes} / ${family.unitBasis}`);
    } else {
      console.log(`  install family      : (none)`);
    }
    console.log(`  installFamilyFallback: ${reviewLine.installFamilyFallback ? `${reviewLine.installFamilyFallback.key} (${reviewLine.installFamilyFallback.minutes} min/${reviewLine.installFamilyFallback.basis})` : '(none)'}`);
    if (suggestion) {
      console.log(`  pricingPreview      : ${suggestion.pricingPreview ? `material=${suggestion.pricingPreview.materialEach}, laborMin=${suggestion.pricingPreview.laborMinutesEach}, qty=${suggestion.pricingPreview.qty}, laborFromInstallFamily=${suggestion.pricingPreview.laborFromInstallFamily ?? false}, familyKey=${suggestion.pricingPreview.installFamilyKey ?? '(none)'}` : '(none)'}`);
      const totalGenerated = suggestion.pricingPreview?.laborFromInstallFamily
        ? (suggestion.pricingPreview.laborMinutesEach ?? 0) * (suggestion.pricingPreview.qty ?? 1)
        : 0;
      console.log(`  generatedLaborMinutes (total): ${totalGenerated}`);
      console.log(`  laborOrigin          : ${suggestion.laborOrigin ?? '(none)'}`);
    } else {
      console.log(`  (no matcher suggestion — scope bucket may not be priced_base_scope)`);
    }
    console.log();
  }

  const partitionExample =
    (byScopeType.get('partition_compartment') || []).find((r) => !r.catalogMatch) ||
    (byScopeType.get('partition_compartment') || [])[0];
  const urinalExample = (byScopeType.get('urinal_screen') || [])[0];
  const grabBarChildExample = grabBarChildren[0];

  if (partitionExample) printExample('Partition compartment without SKU', partitionExample);
  else {
    // Fallback: find any installable row that looks like a partition.
    const alt = reviewLines.find(
      (r) => r.isInstallableScope && /partition|compartment|hdpe|phenolic/i.test(r.description)
    );
    if (alt) printExample('Partition compartment (closest match, no SKU)', alt);
    else console.log('!! No partition compartment example found in this PDF.\n');
  }

  if (urinalExample) printExample('Urinal screen', urinalExample);
  else {
    const alt = reviewLines.find((r) => /urinal/i.test(r.description));
    if (alt) printExample('Urinal screen (fallback match)', alt);
    else console.log('!! No urinal screen example found in this PDF.\n');
  }

  if (grabBarChildExample) printExample('Grab bar set expansion (child)', grabBarChildExample);
  else console.log('!! No grab bar expansion rows found in this PDF.\n');

  // Also print the parent so the expansion is auditable:
  const parent = normalizedLines.find((l) => /grab\s*bar\s*set/i.test(l.description));
  if (parent && grabBarChildren.length) {
    console.log(`--- Grab bar set expansion details ---`);
    console.log(`  parent description  : ${summarize(parent.description)}`);
    console.log(`  parent quantity     : ${parent.quantity} ${parent.unit}`);
    console.log(`  children produced   : ${grabBarChildren.length}`);
    for (const c of grabBarChildren) {
      console.log(`     child: qty=${c.quantity} desc=${summarize(c.description, 80)}`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
