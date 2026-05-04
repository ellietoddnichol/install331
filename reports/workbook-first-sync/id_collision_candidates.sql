-- Run against the same DB the app syncs (read-only).
-- SQLite: GROUP_CONCAT; Postgres: replace with string_agg(id::text, '|' ORDER BY id).

SELECT lower(trim(sku)) AS sku_key,
       COUNT(*) AS row_count,
       GROUP_CONCAT(id) AS ids
FROM catalog_items
WHERE sku IS NOT NULL AND trim(sku) <> ''
GROUP BY lower(trim(sku))
HAVING COUNT(*) > 1
ORDER BY row_count DESC;

-- sheet-item prefix scan (helps spot casing-derived duplicate ids)

SELECT id, sku, catalog_source_tab, catalog_source_row
FROM catalog_items
WHERE id LIKE 'sheet-item-%'
ORDER BY lower(trim(sku)), id;
