export type SkuAliasKind = 'legacy_sku' | 'vendor_sku' | 'parser_phrase' | 'generic' | 'other';

export type EstimatorCatalogAttributeDef = {
  id: string;
  attributeKey: string;
  label: string;
  valueKind: 'freeform' | 'select';
  sortOrder: number;
  active: boolean;
  createdAt: string;
};

export type EstimatorCatalogItemAttribute = {
  id: string;
  catalogItemId: string;
  attributeId: string;
  value: string;
  createdAt: string;
};

export type EstimatorParametricModifier = {
  id: string;
  modifierKey: string;
  name: string;
  description: string;
  /** JSON array of category display names, same idea as `modifiers_v1.applies_to_categories` */
  appliesToCategories: string[];
  addLaborMinutes: number;
  addMaterialCost: number;
  percentLabor: number;
  percentMaterial: number;
  /** Multiplier applied to labor *cost* (and/or minutes) in a future engine; 1 = no effect */
  laborCostMultiplier: number;
  active: boolean;
  updatedAt: string;
};

export type EstimatorSkuAlias = {
  id: string;
  aliasText: string;
  aliasKind: string;
  targetCatalogItemId: string;
  notes: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type EstimatorNormBundle = {
  id: string;
  name: string;
  category: string | null;
  description: string | null;
  legacyBundleId: string | null;
  sortOrder: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type EstimatorNormBundleItem = {
  id: string;
  normBundleId: string;
  catalogItemId: string;
  qty: number;
  sortOrder: number;
  notes: string | null;
};

export type EstimatorCatalogValidationIssueRow = {
  id: string;
  issueType: string;
  entityKind: string | null;
  entityId: string | null;
  sourceRef: string | null;
  message: string;
  detailJson: string | null;
  status: string;
  severity: string | null;
  createdAt: string;
  resolvedAt: string | null;
};
