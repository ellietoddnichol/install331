import { EstimateSummary, PricingMode, ProposalFormat, TakeoffLineRecord, isMaterialOnlyMainBid } from '../types/estimator';
import { isDisplayableCatalogImageUrl } from './catalogImageUrl';

export const PROPOSAL_FORMAT_OPTIONS: Array<{ value: ProposalFormat; label: string; hint: string }> = [
  { value: 'standard', label: 'Standard', hint: 'Full schedule, detailed investment breakdown' },
  { value: 'condensed', label: 'Condensed', hint: 'Tighter typography and spacing' },
  { value: 'schedule_with_amounts', label: 'Schedule + amounts', hint: 'Each line shows extended material + labor $' },
  { value: 'executive_summary', label: 'Executive', hint: 'Section rollups only, emphasis on pricing walkthrough' },
];

export interface ProposalScopeSection {
  section: string;
  itemCount: number;
  material: number;
  labor: number;
  total: number;
  highlights: string[];
}

export interface ProposalLineItem {
  id: string;
  section: string;
  description: string;
  subtitle: string | null;
  quantity: number;
  unit: string;
  total: number;
}

export interface ProposalScheduleItem {
  id: string;
  section: string;
  description: string;
  /** Model #, ratings, size — shown under the friendly title on client proposals */
  subtitle: string | null;
  quantity: number;
  materialCost: number;
  laborCost: number;
  laborHours: number;
  /** Resolved from matched catalog row when `buildProposalScheduleSections` receives a catalog image map. */
  imageUrl: string | null;
}

export interface ProposalScheduleSection {
  section: string;
  items: ProposalScheduleItem[];
  totalMaterialCost: number;
  totalLaborCost: number;
  totalLaborHours: number;
  sectionTotal: number;
}

/**
 * Phase 3.1 — bid-bucket grouping for the proposal schedule. Lets the client-facing
 * proposal render "Base Bid" and "Alt 1" / "Deduct" as visibly distinct areas with
 * their own subtotals instead of blending every line into one category list. Empty
 * or single-bucket projects collapse to a single group so the chrome only shows when
 * it adds information.
 */
export interface ProposalScheduleBidGroup {
  /** Raw bucket label from intake (e.g. "Base Bid", "Alt 1"). Empty string means unbucketed. */
  bucketLabel: string;
  /** Normalized kind for sorting / tone selection. */
  bucketKind: 'base' | 'alternate' | 'deduct' | 'allowance' | 'unit_price' | 'unbucketed' | 'other';
  sections: ProposalScheduleSection[];
  groupTotal: number;
  groupMaterialCost: number;
  groupLaborCost: number;
  groupLaborHours: number;
}

export interface ClientFacingPricingRow {
  label: string;
  amount: number;
}

export function isClientFacingLabel(label: string): boolean {
  const normalized = label.toLowerCase().trim();
  if (!normalized) return false;

  const blockedExact = new Set(['uncategorized', 'general scope', 'general', 'internal', 'test']);
  if (blockedExact.has(normalized)) return false;

  const blockedPattern = /(room|area|zone|test|internal|uncategorized|general scope)/i;
  return !blockedPattern.test(normalized);
}

export function splitProposalTextLines(value: string | null | undefined): string[] {
  return String(value || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function compactProposalItemName(value: string): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (!normalized) return '';
  const sentenceBreak = normalized.search(/[.;:](\s|$)/);
  const base = sentenceBreak > 0 ? normalized.slice(0, sentenceBreak) : normalized;
  if (base.length <= 88) return base;
  return `${base.slice(0, 85).trim()}...`;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const SMALL_UNITS = new Set(['lb', 'lbs', 'oz', 'gal', 'ft', 'in', 'ea', 'pcs', 'pc']);

/** Leading catalog model / SKU token (e.g. FE05C, GB-36) */
const LEADING_MODEL = /^([A-Za-z]{1,6}(?:-\d{2,}[A-Za-z0-9-]*|\d{2,}[A-Za-z0-9-]*))\s+/;
/** UL-style class suffix (e.g. 3A-40BC) */
const TRAILING_RATING = /\s+(\d{1,2}A-\d{1,4}[A-Z0-9-]*)\s*$/i;
const WEIGHT_IN_TEXT = /\b(\d+)\s*(lb|lbs|oz)\b/gi;

function toProposalItemTitleCase(s: string): string {
  const words = s.trim().split(/\s+/).filter(Boolean);
  return words
    .map((word, index) => {
      if (/^\d+([./]\d+)?$/.test(word)) return word;
      const unitGlue = word.match(/^(\d+(?:\.\d+)?)(lb|lbs|oz|gal|ft|in|ea)$/i);
      if (unitGlue) return `${unitGlue[1]} ${unitGlue[2].toLowerCase()}`;
      const lower = word.toLowerCase();
      if (SMALL_UNITS.has(lower) && index > 0) return lower;
      if (word.length <= 1) return word.toUpperCase();
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(' ');
}

function ensureFireExtinguisherWording(s: string): string {
  const lower = s.toLowerCase();
  if (!/\bextinguishers?\b/.test(lower)) return s;
  if (/\bfire\b/.test(lower)) return s;
  return s
    .replace(/\bextinguishers\b/gi, 'fire extinguishers')
    .replace(/\bextinguisher\b/gi, 'fire extinguisher');
}

/**
 * Turns dense catalog lines into a client-facing title plus a subtitle for model #, class, and size.
 * Example: "FE05C Cosmic 5lb Extinguisher 3A-40BC" → title "Cosmic Fire Extinguisher", subtitle "FE05C · 5 lb · 3A-40BC"
 */
export function formatClientProposalItemDisplay(
  rawDescription: string,
  sku: string | null,
  catalogAttributeSnapshot?: TakeoffLineRecord['catalogAttributeSnapshot'] | null
): { title: string; subtitle: string | null } {
  let s = String(rawDescription || '').replace(/\s+/g, ' ').trim();
  if (!s) return { title: '', subtitle: null };

  const snapshot = Array.isArray(catalogAttributeSnapshot) ? catalogAttributeSnapshot : null;

  const subtitleParts: string[] = [];
  const seen = new Set<string>();

  const pushSubtitle = (part: string) => {
    const t = part.trim();
    if (!t) return;
    const key = t.toUpperCase();
    if (seen.has(key)) return;
    seen.add(key);
    subtitleParts.push(t);
  };

  const skuTrim = (sku || '').trim();
  const leadMatch = s.match(LEADING_MODEL);
  if (leadMatch) {
    const code = leadMatch[1]!;
    const codeKey = code.toUpperCase();
    pushSubtitle(skuTrim && skuTrim.toUpperCase() === codeKey ? skuTrim : code);
    if (skuTrim && skuTrim.toUpperCase() !== codeKey) {
      pushSubtitle(skuTrim);
    }
    s = s.slice(leadMatch[0].length).trim();
  } else if (skuTrim) {
    const stripped = s.replace(new RegExp(`^${escapeRegex(skuTrim)}\\s*[-–:.]?\\s*`, 'i'), '').trim();
    if (stripped.length < s.length) {
      s = stripped;
    }
    pushSubtitle(skuTrim);
  }

  const ratingMatch = s.match(TRAILING_RATING);
  if (ratingMatch) {
    pushSubtitle(ratingMatch[1]!);
    s = s.replace(ratingMatch[0], '').trim();
  }

  if (/\bextinguishers?\b/i.test(s)) {
    s = s.replace(WEIGHT_IN_TEXT, (full, n: string, u: string) => {
      const unit = u.toLowerCase() === 'lbs' ? 'lb' : u.toLowerCase();
      pushSubtitle(`${n} ${unit}`);
      return ' ';
    });
    s = s.replace(/\s+/g, ' ').trim();
  }

  s = ensureFireExtinguisherWording(s);
  s = toProposalItemTitleCase(s);

  const optionLabels = (() => {
    if (!snapshot || snapshot.length === 0) return [];

    const byType = new Map<string, string>();
    for (const a of snapshot) {
      if (!a || !a.attributeType || !a.attributeValue) continue;
      // One label per type keeps the proposal concise.
      if (byType.has(a.attributeType)) continue;
      const v = String(a.attributeValue).toUpperCase().trim();
      const t = String(a.attributeType).toLowerCase().trim();

      if (t === 'finish') {
        if (v === 'MATTE_BLACK' || v === 'BLACK') byType.set(t, 'Matte Black');
      } else if (t === 'mounting') {
        if (v === 'RECESSED') byType.set(t, 'Recessed');
        else if (v === 'SEMI_RECESSED' || v === 'SEMI-RECESSED') byType.set(t, 'Semi-recessed');
        else if (v === 'SURFACE' || v === 'SURFACE_MOUNT' || v === 'SURFACE-MOUNT') byType.set(t, 'Surface Mount');
      } else if (t === 'assembly') {
        if (v === 'KD' || v === 'KNOCK_DOWN' || v === 'KNOCK-DOWN') byType.set(t, 'KD Assembly');
      } else if (t === 'coating') {
        if (v === 'ANTIMICROBIAL') byType.set(t, 'Antimicrobial');
      } else if (t === 'grip') {
        if (v === 'PEENED') byType.set(t, 'Peened');
      }
    }

    const labels = Array.from(byType.values()).filter(Boolean);
    if (labels.length === 0) return [];

    const lowerTitle = s.toLowerCase();
    return labels.filter((label) => !lowerTitle.includes(label.toLowerCase()));
  })();

  const maxTitle = 88;
  let title = s;
  if (optionLabels.length > 0) {
    const appended = `${title}, ${optionLabels.join(', ')}`;
    title = appended.length <= maxTitle ? appended : title;
  }
  if (title.length > maxTitle) {
    title = `${title.slice(0, 85).trim()}…`;
  }

  const subtitle = subtitleParts.length ? subtitleParts.join(' · ') : null;
  return { title, subtitle };
}

export function toSentenceCase(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

export function trimScopeHighlight(value: string): string {
  const trimmed = value.trim().replace(/\s+/g, ' ');
  if (trimmed.length <= 56) return trimmed;
  return `${trimmed.slice(0, 53).trim()}...`;
}

export function getProposalSectionLabel(line: TakeoffLineRecord): string {
  const rawCategory = (line.category || '').trim();
  const rawSubcategory = (line.subcategory || '').trim();
  const rawBaseType = (line.baseType || '').trim();

  if (isClientFacingLabel(rawCategory)) return rawCategory;
  if (isClientFacingLabel(rawSubcategory)) return rawSubcategory;
  if (isClientFacingLabel(rawBaseType)) return rawBaseType;
  return 'Additional Scope';
}

export function buildProposalScopeBreakout(lines: TakeoffLineRecord[], showMaterial: boolean, showLabor: boolean): ProposalScopeSection[] {
  const sectionMap = new Map<string, ProposalScopeSection>();

  lines.forEach((line) => {
    const section = getProposalSectionLabel(line);
    const existing = sectionMap.get(section) || {
      section,
      itemCount: 0,
      material: 0,
      labor: 0,
      total: 0,
      highlights: [],
    };

    existing.itemCount += 1;
    const material = showMaterial ? line.materialCost * line.qty : 0;
    const labor = showLabor ? line.laborCost * line.qty : 0;
    existing.material += material;
    existing.labor += labor;
    existing.total += material + labor;

    if (existing.highlights.length < 4 && line.description) {
      const description = line.description.trim();
      if (description && !existing.highlights.includes(description) && description.length <= 120) {
        existing.highlights.push(description);
      }
    }

    sectionMap.set(section, existing);
  });

  return Array.from(sectionMap.values()).sort((left, right) => right.total - left.total);
}

export function buildProposalLineItems(lines: TakeoffLineRecord[]): ProposalLineItem[] {
  const aggregated = new Map<string, ProposalLineItem>();

  lines.forEach((line) => {
    const section = getProposalSectionLabel(line);
    const rawCompact = compactProposalItemName(String(line.description || ''));
    const unit = String(line.unit || 'EA').trim() || 'EA';
    if (!rawCompact) return;

    const display = formatClientProposalItemDisplay(rawCompact, line.sku, line.catalogAttributeSnapshot ?? null);
    if (!display.title) return;

    const key = [section, String(line.sku || '').trim().toLowerCase(), rawCompact.toLowerCase(), unit.toLowerCase()].join('|');
    const existing = aggregated.get(key) || {
      id: key,
      section,
      description: display.title,
      subtitle: display.subtitle,
      quantity: 0,
      unit,
      total: 0,
    };

    existing.quantity += Number(line.qty || 0);
    existing.total += Number(line.lineTotal || 0);
    aggregated.set(key, existing);
  });

  return Array.from(aggregated.values())
    .map((line) => ({
      ...line,
      total: Number(line.total.toFixed(2)),
    }))
    .sort((left, right) => left.section.localeCompare(right.section) || left.description.localeCompare(right.description));
}

export function chunkProposalLineItems(lines: ProposalLineItem[], size: number): ProposalLineItem[][] {
  if (size <= 0) return [lines];
  const chunks: ProposalLineItem[][] = [];
  for (let index = 0; index < lines.length; index += size) {
    chunks.push(lines.slice(index, index + size));
  }
  return chunks;
}

export function buildProposalScheduleSections(
  lines: TakeoffLineRecord[],
  showMaterial: boolean,
  showLabor: boolean,
  laborHourMultiplier = 1,
  catalogImageById?: ReadonlyMap<string, string> | Map<string, string> | null
): ProposalScheduleSection[] {
  const normalizedLaborHourMultiplier = Number.isFinite(laborHourMultiplier) && laborHourMultiplier > 0
    ? laborHourMultiplier
    : 1;
  const sectionMap = new Map<string, Map<string, ProposalScheduleItem>>();

  lines.forEach((line) => {
    const section = getProposalSectionLabel(line);
    const rawCompact = compactProposalItemName(String(line.description || ''));
    const unit = String(line.unit || 'EA').trim() || 'EA';
    if (!rawCompact) return;

    const display = formatClientProposalItemDisplay(rawCompact, line.sku, line.catalogAttributeSnapshot ?? null);
    if (!display.title) return;

    const rawCatalogImage = line.catalogItemId ? catalogImageById?.get(line.catalogItemId)?.trim() : '';
    const safeCatalogImage =
      rawCatalogImage && isDisplayableCatalogImageUrl(rawCatalogImage) ? rawCatalogImage : null;

    const sectionItems = sectionMap.get(section) || new Map<string, ProposalScheduleItem>();
    const key = [String(line.sku || '').trim().toLowerCase(), rawCompact.toLowerCase(), unit.toLowerCase()].join('|');
    const existing = sectionItems.get(key) || {
      id: `${section}|${key}`,
      section,
      description: display.title,
      subtitle: display.subtitle,
      quantity: 0,
      materialCost: 0,
      laborCost: 0,
      laborHours: 0,
      imageUrl: safeCatalogImage,
    };

    if (!existing.imageUrl && safeCatalogImage) {
      existing.imageUrl = safeCatalogImage;
    }

    const quantity = Number(line.qty || 0);
    existing.quantity += quantity;
    existing.materialCost += showMaterial ? Number(line.materialCost || 0) * quantity : 0;
    existing.laborCost += showLabor ? Number(line.laborCost || 0) * quantity : 0;
    existing.laborHours += showLabor ? ((Number(line.laborMinutes || 0) * quantity) / 60) * normalizedLaborHourMultiplier : 0;

    sectionItems.set(key, existing);
    sectionMap.set(section, sectionItems);
  });

  return Array.from(sectionMap.entries())
    .map(([section, sectionItems]) => {
      const items = Array.from(sectionItems.values())
        .map((item) => ({
          ...item,
          quantity: Number(item.quantity.toFixed(2)),
          materialCost: Number(item.materialCost.toFixed(2)),
          laborCost: Number(item.laborCost.toFixed(2)),
          laborHours: Number(item.laborHours.toFixed(2)),
        }))
        .sort((left, right) => left.description.localeCompare(right.description));

      const totalMaterialCost = Number(items.reduce((sum, item) => sum + item.materialCost, 0).toFixed(2));
      const totalLaborCost = Number(items.reduce((sum, item) => sum + item.laborCost, 0).toFixed(2));
      const totalLaborHours = Number(items.reduce((sum, item) => sum + item.laborHours, 0).toFixed(2));

      return {
        section,
        items,
        totalMaterialCost,
        totalLaborCost,
        totalLaborHours,
        sectionTotal: Number((totalMaterialCost + totalLaborCost).toFixed(2)),
      };
    })
    .sort((left, right) => right.sectionTotal - left.sectionTotal || left.section.localeCompare(right.section));
}

function classifyProposalBidBucket(raw: string | null | undefined): ProposalScheduleBidGroup['bucketKind'] {
  const label = (raw || '').trim();
  if (!label) return 'unbucketed';
  const lower = label.toLowerCase();
  if (/\bbase\s*bid\b/.test(lower) || lower === 'base') return 'base';
  if (/\bdeduct/.test(lower)) return 'deduct';
  if (/\balt(?:ernate)?\b/.test(lower)) return 'alternate';
  if (/\ballowance/.test(lower)) return 'allowance';
  if (/\bunit\s*price/.test(lower)) return 'unit_price';
  return 'other';
}

const PROPOSAL_BUCKET_ORDER: Record<ProposalScheduleBidGroup['bucketKind'], number> = {
  base: 0,
  alternate: 1,
  deduct: 2,
  allowance: 3,
  unit_price: 4,
  other: 5,
  unbucketed: 6,
};

/**
 * Phase 3.1 — build the proposal schedule grouped by intake-derived bid bucket.
 * Always returns at least one group; multi-bucket projects get distinct groups
 * sorted base → alternates → deducts → allowance → unit price → other → unbucketed.
 * Lines with no `sourceBidBucket` collapse into an `unbucketed` group rather than
 * being dropped, so manual-added lines stay visible in the proposal.
 */
export function buildProposalScheduleSectionsByBidBucket(
  lines: TakeoffLineRecord[],
  showMaterial: boolean,
  showLabor: boolean,
  laborHourMultiplier = 1,
  catalogImageById?: ReadonlyMap<string, string> | Map<string, string> | null
): ProposalScheduleBidGroup[] {
  const byBucket = new Map<string, TakeoffLineRecord[]>();
  lines.forEach((line) => {
    const raw = line.sourceBidBucket?.trim() || '';
    const key = raw || '__unbucketed__';
    const existing = byBucket.get(key);
    if (existing) existing.push(line);
    else byBucket.set(key, [line]);
  });

  const groups: ProposalScheduleBidGroup[] = [];
  byBucket.forEach((bucketLines, key) => {
    const bucketLabel = key === '__unbucketed__' ? '' : key;
    const bucketKind = classifyProposalBidBucket(bucketLabel || null);
    const sections = buildProposalScheduleSections(
      bucketLines,
      showMaterial,
      showLabor,
      laborHourMultiplier,
      catalogImageById
    );
    const groupMaterialCost = Number(sections.reduce((sum, s) => sum + s.totalMaterialCost, 0).toFixed(2));
    const groupLaborCost = Number(sections.reduce((sum, s) => sum + s.totalLaborCost, 0).toFixed(2));
    const groupLaborHours = Number(sections.reduce((sum, s) => sum + s.totalLaborHours, 0).toFixed(2));
    const groupTotal = Number((groupMaterialCost + groupLaborCost).toFixed(2));
    groups.push({
      bucketLabel,
      bucketKind,
      sections,
      groupTotal,
      groupMaterialCost,
      groupLaborCost,
      groupLaborHours,
    });
  });

  return groups.sort((a, b) => {
    const ko = PROPOSAL_BUCKET_ORDER[a.bucketKind] - PROPOSAL_BUCKET_ORDER[b.bucketKind];
    if (ko !== 0) return ko;
    const numA = Number((a.bucketLabel.match(/\b(\d+)\b/) || [, ''])[1] || '0');
    const numB = Number((b.bucketLabel.match(/\b(\d+)\b/) || [, ''])[1] || '0');
    if (numA !== numB) return numA - numB;
    return a.bucketLabel.localeCompare(b.bucketLabel);
  });
}

export function buildClientFacingPricingRows(
  summary: {
    materialSubtotal: number;
    laborSubtotal: number;
    adjustedLaborSubtotal: number;
    materialLoadedSubtotal?: number;
    laborLoadedSubtotal?: number;
    baseBidTotal: number;
  },
  pricingMode: PricingMode
): ClientFacingPricingRow[] {
  const showMaterial = pricingMode !== 'labor_only';
  const showLabor = !isMaterialOnlyMainBid(pricingMode);
  const materialBase = showMaterial ? Number((summary.materialLoadedSubtotal ?? summary.materialSubtotal) ?? 0) : 0;
  const laborBase = showLabor
    ? Number((summary.laborLoadedSubtotal ?? summary.adjustedLaborSubtotal ?? summary.laborSubtotal) ?? 0)
    : 0;
  const visibleBase = materialBase + laborBase;
  const total = Number(summary.baseBidTotal || 0);

  if (!showMaterial && !showLabor) {
    return [{ label: 'Total', amount: total }];
  }

  if (showMaterial && !showLabor) {
    return [{ label: 'Material', amount: total }];
  }

  if (!showMaterial && showLabor) {
    return [{ label: 'Install', amount: total }];
  }

  if (visibleBase <= 0) {
    const splitAmount = Number((total / 2).toFixed(2));
    return [
      { label: 'Material', amount: splitAmount },
      { label: 'Install', amount: Number((total - splitAmount).toFixed(2)) },
    ];
  }

  const materialAmount = Number(((total * materialBase) / visibleBase).toFixed(2));
  return [
    { label: 'Material', amount: materialAmount },
    { label: 'Install', amount: Number((total - materialAmount).toFixed(2)) },
  ];
}

export interface InvestmentBreakdownRow {
  label: string;
  amount: number;
  /** Strong border before this row */
  isSectionBreak?: boolean;
  /** Bold total line */
  isTotal?: boolean;
}

/**
 * Line items that explain how catalog scope costs become the proposal total
 * (tax, material O&amp;P, labor burden / sub markup, project adders).
 */
export function buildInvestmentBreakdownRows(summary: EstimateSummary, pricingMode: PricingMode): InvestmentBreakdownRow[] {
  const rows: InvestmentBreakdownRow[] = [];
  const showM = pricingMode !== 'labor_only';
  const showL = !isMaterialOnlyMainBid(pricingMode);

  if (showM && summary.materialLoadedSubtotal > 0) {
    const hasMatMarkup =
      summary.taxAmount > 0 || summary.overheadAmount > 0 || summary.profitAmount > 0;
    if (hasMatMarkup) {
      rows.push({
        label: 'Material & supplies (incl. waste & field pads, before tax)',
        amount: summary.materialSubtotal,
      });
      if (summary.taxAmount > 0) {
        rows.push({ label: 'Sales tax on material', amount: summary.taxAmount });
      }
      if (summary.overheadAmount > 0) {
        rows.push({
          label: summary.profitAmount > 0 ? 'Material overhead' : 'Material O&P (on material after tax)',
          amount: summary.overheadAmount,
        });
      }
      if (summary.profitAmount > 0) {
        rows.push({ label: 'Material profit (stacked)', amount: summary.profitAmount });
      }
      rows.push({
        label: 'Subtotal — materials (sell)',
        amount: summary.materialLoadedSubtotal,
        isSectionBreak: true,
      });
    } else {
      rows.push({
        label: 'Materials (catalog costs & field pads)',
        amount: summary.materialLoadedSubtotal,
        isSectionBreak: true,
      });
    }
  }

  if (showL && summary.laborLoadedSubtotal > 0) {
    const hasLaborMarkup =
      summary.burdenAmount > 0 ||
      summary.laborOverheadAmount > 0 ||
      summary.laborProfitAmount > 0 ||
      summary.subLaborManagementFeeAmount > 0;
    if (hasLaborMarkup) {
      rows.push({
        label: 'Install labor (est., before burden & sub markup)',
        amount: summary.adjustedLaborSubtotal,
      });
      if (summary.burdenAmount > 0) {
        rows.push({ label: 'Labor burden (subcontractor)', amount: summary.burdenAmount });
      }
      if (summary.laborOverheadAmount > 0) {
        rows.push({ label: 'Labor overhead (sub)', amount: summary.laborOverheadAmount });
      }
      if (summary.laborProfitAmount > 0) {
        rows.push({ label: 'Labor profit (sub)', amount: summary.laborProfitAmount });
      }
      if (summary.subLaborManagementFeeAmount > 0) {
        rows.push({ label: 'Sub labor management fee', amount: summary.subLaborManagementFeeAmount });
      }
      rows.push({
        label: 'Subtotal — install (sell)',
        amount: summary.laborLoadedSubtotal,
        isSectionBreak: true,
      });
    } else {
      rows.push({
        label: 'Install labor (loaded rate)',
        amount: summary.laborLoadedSubtotal,
        isSectionBreak: true,
      });
    }
  }

  const materialPart = showM ? summary.materialLoadedSubtotal : 0;
  const laborPart = showL ? summary.laborLoadedSubtotal : 0;
  const adder = Number((summary.baseBidTotal - materialPart - laborPart).toFixed(2));
  if (Math.abs(adder) > 0.02) {
    rows.push({ label: 'Project conditions / adders', amount: adder });
  }

  rows.push({ label: 'Total proposal', amount: summary.baseBidTotal, isTotal: true });
  return rows;
}

/**
 * Phase 3.2 — summary of where each labor-bearing line's minutes came from.
 * `source` = the source document / vendor quote priced labor on that line directly.
 * `catalog` = our catalog item's default labor minutes were used.
 * `install_family` = no usable source or catalog labor, so the app filled in
 * labor from a generic install-family fallback (e.g. "partition_compartment").
 *
 * The proposal uses this to surface a plain-English transparency footnote when
 * some or all of the labor was app-generated rather than vendor-quoted.
 */
export interface ProposalLaborOriginBreakdown {
  /** Lines that carry extended labor minutes > 0. */
  totalLaborLineCount: number;
  sourceLineCount: number;
  catalogLineCount: number;
  installFamilyLineCount: number;
  /** Labor minutes from lines flagged `source` (sum of laborMinutes × qty). */
  sourceMinutes: number;
  catalogMinutes: number;
  installFamilyMinutes: number;
  totalMinutes: number;
  /** True when at least one labor-bearing line was app-generated (catalog default or install-family fallback). */
  hasGenerated: boolean;
}

export function summarizeLaborOriginBreakdown(lines: TakeoffLineRecord[]): ProposalLaborOriginBreakdown {
  const breakdown: ProposalLaborOriginBreakdown = {
    totalLaborLineCount: 0,
    sourceLineCount: 0,
    catalogLineCount: 0,
    installFamilyLineCount: 0,
    sourceMinutes: 0,
    catalogMinutes: 0,
    installFamilyMinutes: 0,
    totalMinutes: 0,
    hasGenerated: false,
  };
  for (const line of lines) {
    const unitMinutes = Number(line.laborMinutes) || 0;
    const qty = Number(line.qty) || 0;
    const extMinutes = unitMinutes * qty;
    if (extMinutes <= 0) continue;
    breakdown.totalLaborLineCount += 1;
    breakdown.totalMinutes += extMinutes;
    const origin: 'source' | 'catalog' | 'install_family' =
      line.laborOrigin === 'source'
        ? 'source'
        : line.laborOrigin === 'install_family'
          ? 'install_family'
          : 'catalog';
    if (origin === 'source') {
      breakdown.sourceLineCount += 1;
      breakdown.sourceMinutes += extMinutes;
    } else if (origin === 'catalog') {
      breakdown.catalogLineCount += 1;
      breakdown.catalogMinutes += extMinutes;
      breakdown.hasGenerated = true;
    } else {
      breakdown.installFamilyLineCount += 1;
      breakdown.installFamilyMinutes += extMinutes;
      breakdown.hasGenerated = true;
    }
  }
  return breakdown;
}

/**
 * Phase 3.2 — client-facing sentences describing how labor was priced on this
 * proposal. Returns an empty array when nothing notable needs to be disclosed
 * (e.g. labor is hidden, or 100% of labor was vendor-quoted on the source).
 */
export function buildLaborOriginFootnote(
  lines: TakeoffLineRecord[],
  showLabor: boolean
): string[] {
  if (!showLabor) return [];
  const breakdown = summarizeLaborOriginBreakdown(lines);
  if (breakdown.totalLaborLineCount === 0) return [];
  if (!breakdown.hasGenerated) return [];

  const notes: string[] = [];
  const generatedLines = breakdown.catalogLineCount + breakdown.installFamilyLineCount;
  const totalLines = breakdown.totalLaborLineCount;
  const allGenerated = breakdown.sourceLineCount === 0;
  const anyVendor = breakdown.sourceLineCount > 0;

  if (allGenerated) {
    notes.push(
      'Install labor on this proposal was generated from our internal labor standards. The source documents did not include itemized labor pricing.'
    );
  } else {
    notes.push(
      `Install labor was generated from our internal labor standards for ${generatedLines} of ${totalLines} priced items. The remaining ${breakdown.sourceLineCount} item${breakdown.sourceLineCount === 1 ? '' : 's'} used labor pricing provided by the source vendor quote.`
    );
  }

  if (breakdown.installFamilyLineCount > 0) {
    const label = breakdown.installFamilyLineCount === 1 ? 'item used' : 'items used';
    notes.push(
      `${breakdown.installFamilyLineCount} ${label} an install-family labor default because no exact catalog match or vendor labor was available. We are happy to confirm those assumptions on request.`
    );
  }

  if (anyVendor && breakdown.catalogLineCount > 0 && breakdown.installFamilyLineCount === 0) {
    notes.push(
      'Labor assumptions reflect our typical production rates for commercial Division 10 scopes and can be tightened after a site visit.'
    );
  }

  return notes;
}