import { useEffect, useRef } from 'react';
import { api } from '../services/api';

const STORAGE_KEY = 'catalogAutoSyncLastAtMs';
/** Minimum time between successful background pulls from Google Sheets (was 3h; shorter feels more “automatic”). */
const SYNC_INTERVAL_MS = 30 * 60 * 1000;

/**
 * After sign-in, pulls catalog from Google Sheets in the background so SQLite matches the sheet
 * without visiting Settings or Catalog. Throttled by last successful sync in localStorage. If sync fails,
 * the timestamp is not updated so the next full page load will try again (use Settings → Sync for immediate pull).
 */
export function CatalogAutoSync() {
  const ranRef = useRef(false);

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;

    const lastSuccess = Number(localStorage.getItem(STORAGE_KEY) || '0');
    const now = Date.now();
    const sinceSuccess = Number.isFinite(lastSuccess) && lastSuccess > 0 ? now - lastSuccess : Infinity;
    if (sinceSuccess < SYNC_INTERVAL_MS) return;

    void (async () => {
      try {
        await api.syncV1Catalog();
        localStorage.setItem(STORAGE_KEY, String(Date.now()));
        window.dispatchEvent(new CustomEvent('catalog-synced'));
      } catch (err) {
        console.warn('[catalog] Background Google Sheets sync failed (manual sync in Settings still works).', err);
      }
    })();
  }, []);

  return null;
}
