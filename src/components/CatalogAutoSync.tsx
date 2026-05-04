import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { api } from '../services/api';
import { queryKeys } from '../lib/queryKeys.ts';

/**
 * Dedupe only React Strict Mode’s double effect in dev (same JS realm, back-to-back).
 * Does not throttle real revisits — each full load of the authenticated shell triggers a sync.
 */
let lastCatalogAutoSyncAttemptAt = 0;
const STRICT_MODE_DEDUP_MS = 5000;

/**
 * After sign-in, pulls catalog from Google Sheets in the background on every app open (each time
 * the protected shell mounts) so SQLite matches the sheet without visiting Settings or Catalog.
 * If sync fails, the next full page load tries again (Settings → Sync is still available for a manual pull).
 */
export function CatalogAutoSync() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const now = Date.now();
    if (now - lastCatalogAutoSyncAttemptAt < STRICT_MODE_DEDUP_MS) return;
    lastCatalogAutoSyncAttemptAt = now;

    void (async () => {
      try {
        await api.syncV1Catalog();
        await queryClient.invalidateQueries({ queryKey: queryKeys.catalog.workspace });
        /**
         * Defer the window event until after the current commit so routes that mount in the same
         * tick (Intake, workspace) can attach `catalog-synced` listeners before the event fires.
         */
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent('catalog-synced'));
        }, 0);
      } catch (err) {
        console.warn('[catalog] Background Google Sheets sync failed (manual sync in Settings still works).', err);
      }
    })();
  }, [queryClient]);

  return null;
}
