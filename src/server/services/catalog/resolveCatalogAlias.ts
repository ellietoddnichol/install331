import { resolveTargetCatalogItemIdBySkuOrAlias } from '../../repos/estimatorNormCatalogRepo.ts';

export { resolveTargetCatalogItemIdBySkuOrAlias };

/**
 * @deprecated use `resolveTargetCatalogItemIdBySkuOrAlias` — same behavior.
 * Kept for short imports while Phase 2 rolls out.
 */
export const resolveCatalogItemIdForInput = resolveTargetCatalogItemIdBySkuOrAlias;
