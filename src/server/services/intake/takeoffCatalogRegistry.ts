import type { CatalogItem } from '../../../types.ts';
import { estimatorDb } from '../../db/connection.ts';

export const TAKEOFF_TOKEN_ALIAS_MAP: Record<string, string[]> = {
  gb: ['grab', 'bar', 'grab bar'],
  ch: ['coat', 'hook', 'coat hook'],
  snv: ['sanitary', 'napkin', 'vendor', 'sanitary napkin vendor'],
  snd: ['sanitary', 'napkin', 'disposal', 'sanitary napkin disposal'],
  ttd: ['toilet', 'tissue', 'dispenser', 'toilet tissue dispenser'],
  tpd: ['toilet', 'paper', 'dispenser'],
  ptd: ['paper', 'towel', 'dispenser', 'paper towel dispenser'],
  sd: ['soap', 'dispenser'],
  sc: ['shower', 'curtain'],
  scr: ['shower', 'curtain', 'rod', 'shower curtain rod'],
  sch: ['shower', 'curtain', 'hook', 'shower curtain hooks'],
  fss: ['folding', 'shower', 'seat', 'folding shower seat'],
  hd: ['hand', 'dryer'],
  nd: ['napkin', 'disposal'],
  rk: ['recess', 'kit'],
};

export const TAKEOFF_FAMILY_HINT_MAP: Record<string, string> = {
  gb: 'grab bar',
  ch: 'coat hook',
  snv: 'sanitary napkin vendor',
  snd: 'sanitary napkin disposal',
  ttd: 'toilet tissue dispenser',
  sd: 'soap dispenser',
  sc: 'shower curtain',
  scr: 'shower curtain rod',
  sch: 'shower curtain hooks',
  fss: 'folding shower seat',
  hd: 'hand dryer',
  b290: 'mirror',
  b212: 'coat hook',
  b270: 'sanitary napkin disposal',
  b2706: 'sanitary napkin vendor',
  w556509: 'toilet tissue dispenser',
  w51919: 'soap dispenser',
  b6806: 'grab bar',
  xlsb: 'hand dryer',
};

export const TAKEOFF_CATALOG_SEED_ITEMS: CatalogItem[] = [
  {
    id: 'takeoff-gb-36',
    sku: 'GB-36',
    category: 'Toilet Accessories',
    family: 'grab bar',
    description: 'Grab Bar - 36" SS (GB)',
    manufacturer: 'Bobrick',
    model: 'B6806',
    uom: 'EA',
    baseMaterialCost: 52,
    baseLaborMinutes: 20,
    taxable: true,
    adaFlag: true,
    tags: ['gb', 'grab bar', '36'],
    notes: 'Takeoff registry seed for matrix shorthand coverage.',
    active: true,
  },
  {
    id: 'takeoff-gb-b6806-42',
    sku: 'GB-B6806-42',
    category: 'Toilet Accessories',
    family: 'grab bar',
    description: 'Grab Bar - 42" SS Bobrick B6806',
    manufacturer: 'Bobrick',
    model: 'B6806',
    uom: 'EA',
    baseMaterialCost: 58,
    baseLaborMinutes: 22,
    taxable: true,
    adaFlag: true,
    tags: ['gb', 'grab bar', '42', 'b6806'],
    notes: 'Takeoff registry seed for model-based grab bar shorthand.',
    active: true,
  },
  {
    id: 'takeoff-gb-2wall',
    sku: '2-WALL-GB',
    category: 'Toilet Accessories',
    family: 'grab bar',
    description: 'Two-Wall Grab Bar Assembly',
    manufacturer: 'Bobrick',
    model: 'B-2WALL',
    uom: 'EA',
    baseMaterialCost: 90,
    baseLaborMinutes: 35,
    taxable: true,
    adaFlag: true,
    tags: ['2 wall gb', 'two wall grab bar', 'grab bar'],
    notes: 'Takeoff registry seed for two-wall grab bar shorthand.',
    active: true,
  },
  {
    id: 'takeoff-ch-b212',
    sku: 'CH-B212',
    category: 'Toilet Accessories',
    family: 'coat hook',
    description: 'Coat Hook',
    manufacturer: 'Bobrick',
    model: 'B212',
    uom: 'EA',
    baseMaterialCost: 18,
    baseLaborMinutes: 10,
    taxable: true,
    adaFlag: false,
    tags: ['ch', 'coat hook', 'b212'],
    notes: 'Takeoff registry seed for Bobrick coat hook shorthand.',
    active: true,
  },
  {
    id: 'takeoff-snv-b2706',
    sku: 'SNV-B2706',
    category: 'Toilet Accessories',
    family: 'sanitary napkin vendor',
    description: 'Sanitary Napkin Vendor',
    manufacturer: 'Bobrick',
    model: 'B2706',
    uom: 'EA',
    baseMaterialCost: 120,
    baseLaborMinutes: 25,
    taxable: true,
    adaFlag: false,
    tags: ['snv', 'sanitary napkin vendor', 'b2706'],
    notes: 'Takeoff registry seed for sanitary napkin vendor shorthand.',
    active: true,
  },
  {
    id: 'takeoff-snd-b270',
    sku: 'SND-B270',
    category: 'Toilet Accessories',
    family: 'sanitary napkin disposal',
    description: 'Sanitary Napkin Disposal',
    manufacturer: 'Bobrick',
    model: 'B270',
    uom: 'EA',
    baseMaterialCost: 54,
    baseLaborMinutes: 16,
    taxable: true,
    adaFlag: false,
    tags: ['snd', 'sanitary napkin disposal', 'b270'],
    notes: 'Takeoff registry seed for sanitary napkin disposal shorthand.',
    active: true,
  },
  {
    id: 'takeoff-ttd-w556509',
    sku: 'TTD-W556509',
    category: 'Toilet Accessories',
    family: 'toilet tissue dispenser',
    description: 'Toilet Tissue Dispenser',
    manufacturer: 'ASI',
    model: 'W556509',
    uom: 'EA',
    baseMaterialCost: 68,
    baseLaborMinutes: 18,
    taxable: true,
    adaFlag: false,
    tags: ['ttd', 'toilet tissue dispenser', 'w556509'],
    notes: 'Takeoff registry seed for ASI tissue dispenser shorthand.',
    active: true,
  },
  {
    id: 'takeoff-sd-w51919-04',
    sku: 'SD-W51919-04',
    category: 'Toilet Accessories',
    family: 'soap dispenser',
    description: 'Soap Dispenser with LTX-12 Top Fill',
    manufacturer: 'ASI',
    model: 'W51919-04',
    uom: 'EA',
    baseMaterialCost: 88,
    baseLaborMinutes: 20,
    taxable: true,
    adaFlag: false,
    tags: ['sd', 'soap dispenser', 'w51919-04', 'ltx-12'],
    notes: 'Takeoff registry seed for ASI soap dispenser shorthand.',
    active: true,
  },
  {
    id: 'takeoff-hd-xlsb-rec',
    sku: 'HD-XL-SB-REC',
    category: 'Toilet Accessories',
    family: 'hand dryer',
    description: 'High Speed Hand Dryer XL-SB with Recess Kit',
    manufacturer: 'Excel Dryer',
    model: 'XL-SB',
    uom: 'EA',
    baseMaterialCost: 420,
    baseLaborMinutes: 35,
    taxable: true,
    adaFlag: false,
    tags: ['hd', 'hand dryer', 'xl-sb', 'recess kit'],
    notes: 'Takeoff registry seed for recess-mounted hand dryer shorthand.',
    active: true,
  },
  {
    id: 'takeoff-scr-36',
    sku: 'SCR-36',
    category: 'Toilet Accessories',
    family: 'shower curtain rod',
    description: 'Shower Curtain Rod 36 inch Stainless Steel',
    manufacturer: 'ASI',
    model: 'SCR-36',
    uom: 'EA',
    baseMaterialCost: 55,
    baseLaborMinutes: 18,
    taxable: true,
    adaFlag: false,
    tags: ['scr', 'shower curtain rod', '36'],
    notes: 'Takeoff registry seed for shower curtain rod shorthand.',
    active: true,
  },
  {
    id: 'takeoff-sc',
    sku: 'SC',
    category: 'Toilet Accessories',
    family: 'shower curtain',
    description: 'Vinyl Shower Curtain - White',
    manufacturer: 'ASI',
    model: 'SC',
    uom: 'EA',
    baseMaterialCost: 28,
    baseLaborMinutes: 8,
    taxable: true,
    adaFlag: false,
    tags: ['sc', 'shower curtain'],
    notes: 'Takeoff registry seed for shower curtain shorthand.',
    active: true,
  },
  {
    id: 'takeoff-sch',
    sku: 'SCH',
    category: 'Toilet Accessories',
    family: 'shower curtain hooks',
    description: 'Shower Curtain Hooks (Set of 12)',
    manufacturer: 'ASI',
    model: 'SCH',
    uom: 'EA',
    baseMaterialCost: 12,
    baseLaborMinutes: 6,
    taxable: true,
    adaFlag: false,
    tags: ['sch', 'shower curtain hooks'],
    notes: 'Takeoff registry seed for shower curtain hook shorthand.',
    active: true,
  },
  {
    id: 'takeoff-fss',
    sku: 'FSS',
    category: 'Toilet Accessories',
    family: 'folding shower seat',
    description: 'Folding Shower Seat - Stainless Steel',
    manufacturer: 'ASI',
    model: 'FSS',
    uom: 'EA',
    baseMaterialCost: 310,
    baseLaborMinutes: 45,
    taxable: true,
    adaFlag: true,
    tags: ['fss', 'folding shower seat', 'shower seat'],
    notes: 'Takeoff registry seed for folding shower seat shorthand.',
    active: true,
  },
  {
    id: 'takeoff-b290-1836',
    sku: 'B290-1836',
    category: 'Toilet Accessories',
    family: 'mirror',
    description: 'Mirror B290 18x36 Stainless Steel Frame',
    manufacturer: 'Bobrick',
    model: 'B290',
    uom: 'EA',
    baseMaterialCost: 110,
    baseLaborMinutes: 20,
    taxable: true,
    adaFlag: false,
    tags: ['b290', 'mirror', '1836', '18x36'],
    notes: 'Takeoff registry seed for Bobrick mirror shorthand.',
    active: true,
  },
];

function findExistingItemId(seedItem: CatalogItem): string | null {
  const existing = estimatorDb.prepare(`
    SELECT id
    FROM catalog_items
    WHERE id = ?
      OR lower(COALESCE(sku, '')) = lower(?)
      OR (lower(COALESCE(model, '')) = lower(?) AND lower(COALESCE(description, '')) = lower(?))
    LIMIT 1
  `).get(seedItem.id, seedItem.sku, seedItem.model || '', seedItem.description) as { id: string } | undefined;

  return existing?.id || null;
}

export function ensureTakeoffCatalogSeeded(): void {
  const upsert = estimatorDb.prepare(`
    INSERT INTO catalog_items (
      id, sku, category, subcategory, family, description, manufacturer, model, uom,
      base_material_cost, base_labor_minutes, labor_unit_type, taxable, ada_flag, tags, notes, active
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const update = estimatorDb.prepare(`
    UPDATE catalog_items
    SET sku = ?, category = ?, subcategory = ?, family = ?, description = ?, manufacturer = ?, model = ?, uom = ?,
        base_material_cost = ?, base_labor_minutes = ?, labor_unit_type = ?, taxable = ?, ada_flag = ?, tags = ?, notes = ?, active = ?
    WHERE id = ?
  `);

  const transaction = estimatorDb.transaction((items: CatalogItem[]) => {
    items.forEach((item) => {
      const targetId = findExistingItemId(item);
      const values = [
        item.sku,
        item.category,
        item.subcategory || null,
        item.family || null,
        item.description,
        item.manufacturer || null,
        item.model || null,
        item.uom,
        item.baseMaterialCost,
        item.baseLaborMinutes,
        item.laborUnitType || null,
        item.taxable ? 1 : 0,
        item.adaFlag ? 1 : 0,
        JSON.stringify(item.tags || []),
        item.notes || null,
        item.active ? 1 : 0,
      ] as const;

      if (!targetId) {
        upsert.run(item.id, ...values);
        return;
      }

      update.run(...values, targetId);
    });
  });

  transaction(TAKEOFF_CATALOG_SEED_ITEMS);
}