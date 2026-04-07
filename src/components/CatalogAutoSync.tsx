import { useEffect, useRef } from 'react';
import { api } from '../services/api';

const STORAGE_KEY = 'catalogAutoSyncLastAtMs';
/** Background sync at most once per this interval (override in code if needed). */
const SYNC_INTERVAL_MS = 3 * 60 * 60 * 1000;

/**
 * After sign-in, periodically pulls catalog from Google Sheets in the background so SQLite matches the sheet
 * without visiting Settings or Catalog. Throttled via localStorage; failures are silent (missing SA creds, offline).
 */
export function CatalogAutoSync() {
  const ranRef = useRef(false);

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;

    const last = Number(localStorage.getItem(STORAGE_KEY) || '0');
    if (Number.isFinite(last) && Date.now() - last < SYNC_INTERVAL_MS) return;

    void (async () => {
      try {
        await api.syncV1Catalog();
        localStorage.setItem(STORAGE_KEY, String(Date.now()));
        window.dispatchEvent(new CustomEvent('catalog-synced'));
      } catch {
        // Expected when GOOGLE_SERVICE_ACCOUNT_* is unset or Sheets API errors.
      }
    })();
  }, []);

  return null;
}
