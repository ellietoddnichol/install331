/** Display rows that allow per-line actions map 1:1 to real `takeoff_lines_v1` ids. */
export interface BulkSelectableRow {
  lineId: string;
  canDelete: boolean;
}

/** Rows actually rendered in the grid (excludes lines hidden inside a collapsed bundle). */
export function filterDisplayRowsVisibleInTable<T extends { bundleId: string | null }>(
  displayRows: T[],
  organizeBy: 'room' | 'item',
  collapsedBundleIds: ReadonlySet<string>
): T[] {
  return displayRows.filter((row, index) => {
    const previousBundleId = index > 0 ? displayRows[index - 1]!.bundleId : null;
    const isBundleStart = organizeBy === 'room' && !!row.bundleId && (index === 0 || previousBundleId !== row.bundleId);
    const isBundleCollapsed = organizeBy === 'room' && !!row.bundleId && collapsedBundleIds.has(row.bundleId);
    return organizeBy === 'item' || !row.bundleId || !isBundleCollapsed || isBundleStart;
  });
}

export function visibleConcreteLineIds(rows: BulkSelectableRow[]): string[] {
  return rows.filter((r) => r.canDelete).map((r) => r.lineId);
}

/**
 * Header checkbox: if every visible concrete id is selected, remove those from the set;
 * otherwise add all visible concrete ids (union).
 */
export function toggleBulkSelectionForVisibleConcrete(
  current: ReadonlySet<string>,
  visibleConcreteIds: string[]
): Set<string> {
  const vis = visibleConcreteIds;
  const allSelected = vis.length > 0 && vis.every((id) => current.has(id));
  const next = new Set(current);
  if (allSelected) {
    for (const id of vis) next.delete(id);
  } else {
    for (const id of vis) next.add(id);
  }
  return next;
}
