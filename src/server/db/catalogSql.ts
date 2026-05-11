import { isPgCatalogBackend } from './catalogBackend.ts';

function catalogSqlUsePgCasts(): boolean {
  return isPgCatalogBackend();
}

/**
 * WHERE fragment: treat row as "active" for catalog tables/views.
 * Postgres may use `boolean` (native tables) or int 0/1 (SQLite-shaped); `(col)::int = 1` covers both.
 */
export function sqlCatalogActiveEqualsOne(column = 'active'): string {
  return catalogSqlUsePgCasts() ? `((${column})::int = 1)` : `${column} = 1`;
}

export function sqlCatalogActiveEqualsZero(column: string): string {
  return catalogSqlUsePgCasts() ? `((${column})::int = 0)` : `${column} = 0`;
}

/** Same semantics as legacy `COALESCE(deprecated, 0) = 0` but safe when `deprecated` is boolean in Postgres. */
export function sqlCatalogDeprecatedCoalescedZeroExpr(column = 'deprecated'): string {
  return catalogSqlUsePgCasts() ? `COALESCE((${column})::int, 0) = 0` : `COALESCE(${column}, 0) = 0`;
}

/** Strict canonical row (`is_canonical` must be true / 1, not NULL). */
export function sqlCatalogIsCanonicalOne(column: string): string {
  return catalogSqlUsePgCasts() ? `((${column})::int = 1)` : `${column} = 1`;
}

/** NULL or canonical (matches legacy search filter). */
export function sqlCatalogNullableCanonicalOrOne(column: string): string {
  return catalogSqlUsePgCasts()
    ? `(${column} IS NULL OR (${column})::int = 1)`
    : `(${column} IS NULL OR ${column} = 1)`;
}

/** Forward-facing catalog row (single-table `FROM catalog_items` — unqualified column names). */
export function sqlCatalogForwardFacingPredicate(): string {
  return `${sqlCatalogActiveEqualsOne('active')} AND ${sqlCatalogDeprecatedCoalescedZeroExpr('deprecated')} AND ${sqlCatalogIsCanonicalOne('is_canonical')}`;
}

export function sqlCatalogCaseWhenActiveOne(column = 'active'): string {
  return `CASE WHEN ${sqlCatalogActiveEqualsOne(column)} THEN 1 ELSE 0 END`;
}

export function sqlCatalogCaseWhenActiveZero(column = 'active'): string {
  return `CASE WHEN ${sqlCatalogActiveEqualsZero(column)} THEN 1 ELSE 0 END`;
}

/** RHS for UPDATE … SET active = … (boolean vs int storage). */
export function sqlCatalogLiteralActiveTrue(): string {
  return catalogSqlUsePgCasts() ? 'TRUE' : '1';
}
