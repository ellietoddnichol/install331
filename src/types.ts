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
}
