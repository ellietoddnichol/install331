/**
 * Legacy shared types. This file previously held a large grab-bag of front-end
 * models (`Project`, `Scope`, `UserProfile`, `EstimateResult`, `ProjectSettings`,
 * `ProposalSettings`, `ProjectStatus`, `Room`, `Alternate`, `Bundle`,
 * `ProjectLine`, `CalculatedLine`, `GroupSummary`, `AddIn`, `Modifier`,
 * `ModifierGroup`) that were never imported anywhere after the v1 intake/takeoff
 * pipeline landed.
 *
 * Today only `CatalogItem` and `UOM` are referenced by the live code (see
 * `npm run lint` / import graph). All authoritative project / takeoff / modifier
 * shapes live in `src/shared/types/estimator.ts` alongside `TakeoffLineRecord`.
 * Keeping the duplicates around was causing type drift between the new pipeline
 * and the old pre-v1 UI (Phase 0.5 of the data-integrity cleanup).
 */

export type UOM = 'EA' | 'LF' | 'SF' | 'CY' | 'HR';

export type CatalogRecordGranularity = 'component' | 'system_canonical';
export type CatalogPrivacyLevel = 'standard' | 'enhanced' | 'full_height';

export interface CatalogItem {
  id: string;
  sku: string;
  category: string;
  subcategory?: string;
  family?: string;
  description: string;
  manufacturer?: string;
  /** Commercial / go-to-market brand line (may match manufacturer or a sub-brand). */
  brand?: string;
  model?: string;
  /** Full manufacturer catalog or part model number (distinct from short `model` label when both used). */
  modelNumber?: string;
  /** Product family / series / collection name. */
  series?: string;
  /** URL for a product image (https, CDN, or in-app path); optional. */
  imageUrl?: string;
  uom: UOM;
  baseMaterialCost: number;
  baseLaborMinutes: number;
  laborUnitType?: string;
  taxable: boolean;
  adaFlag: boolean;
  tags?: string[];
  notes?: string;
  active: boolean;
  /**
   * Optional install-labor-family key used for fallback install pricing when an intake row
   * is flagged as installable scope but no exact SKU/labor is present in the catalog. Values
   * must match keys in `src/server/services/intake/installLaborFamilies.ts`.
   */
  installLaborFamily?: string | null;

  /**
   * Transitional canonicalization fields (Phase 4/5 hardening).
   *
   * Goal: move toward one canonical “real item” row + optional alias/attribute rows
   * without breaking current catalog reads. Existing UI continues to primarily key off
   * `sku` until canonicalization is fully wired end-to-end.
   */
  canonicalSku?: string | null;
  isCanonical?: boolean;
  /** If this row is an alias/attribute record, points to the canonical item's id (transitional). */
  aliasOf?: string | null;
  /** Human-readable labor basis (e.g. per_each, per_set, per_lf). */
  laborBasis?: string | null;
  /** Mounting / install modality (e.g. surface, recessed). */
  defaultMountingType?: string | null;
  /** Finish grouping key (e.g. SS/CH/PB), used to collapse duplicate finish rows. */
  finishGroup?: string | null;
  /** Attribute family key for variant logic (size/length/handing). */
  attributeGroup?: string | null;
  /** Groups near-duplicate rows for safe collapse/backfill. */
  duplicateGroupKey?: string | null;
  /** Soft deprecation flag for legacy/duplicate rows. */
  deprecated?: boolean;
  deprecatedReason?: string | null;

  /**
   * Governed system/catalog metadata (partitions and other configurable systems).
   * Additive only: consumers can ignore these fields safely.
   */
  recordGranularity?: CatalogRecordGranularity | null;
  materialFamily?: string | null;
  systemSeries?: string | null;
  privacyLevel?: CatalogPrivacyLevel | null;
  manufacturerConfiguredItem?: boolean;
  canonicalMatchAnchor?: boolean;
  exactComponentSku?: boolean;
  requiresProjectConfiguration?: boolean;
  defaultUnit?: string | null;
  estimatorNotes?: string | null;
}

export type CatalogAliasType = 'legacy_sku' | 'vendor_sku' | 'parser_phrase' | 'generic_name' | 'search_key';

export interface CatalogItemAlias {
  id: string;
  catalogItemId: string;
  aliasType: CatalogAliasType;
  aliasValue: string;
}

export type CatalogAttributeType = 'finish' | 'coating' | 'grip' | 'mounting' | 'assembly';
export type CatalogDeltaType = 'absolute' | 'percent' | 'minutes';

export interface CatalogItemAttribute {
  id: string;
  catalogItemId: string;
  attributeType: CatalogAttributeType;
  attributeValue: string;
  materialDeltaType?: CatalogDeltaType | null;
  materialDeltaValue?: number | null;
  laborDeltaType?: CatalogDeltaType | null;
  laborDeltaValue?: number | null;
  active: boolean;
  sortOrder: number;
}
