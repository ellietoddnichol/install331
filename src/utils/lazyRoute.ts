import { lazy, type ComponentType, type LazyExoticComponent } from 'react';

const CHUNK_RELOAD_SESSION_KEY = 'install331:chunk-reload-attempted';

function isStaleChunkLoadError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    /Failed to fetch dynamically imported module/i.test(msg)
    || /Importing a module script failed/i.test(msg)
    || /error loading dynamically imported module/i.test(msg)
    || /ChunkLoadError/i.test(msg)
  );
}

/**
 * After a Cloud Run deploy, hashed asset names change. Browsers that still hold an old
 * entry bundle may request missing `/assets/*.js` chunks — reload once to pick up index.html.
 */
async function importWithChunkReload<T>(importer: () => Promise<T>): Promise<T> {
  try {
    const mod = await importer();
    sessionStorage.removeItem(CHUNK_RELOAD_SESSION_KEY);
    return mod;
  } catch (err) {
    if (isStaleChunkLoadError(err) && !sessionStorage.getItem(CHUNK_RELOAD_SESSION_KEY)) {
      sessionStorage.setItem(CHUNK_RELOAD_SESSION_KEY, '1');
      window.location.reload();
      return new Promise(() => {
        /* hang until navigation */
      });
    }
    throw err;
  }
}

/** Lazy-load a page with a named export (e.g. `Dashboard`). */
export function lazyPage<M extends Record<string, ComponentType<unknown>>, K extends keyof M>(
  importer: () => Promise<M>,
  exportName: K,
): LazyExoticComponent<M[K]> {
  return lazy(() =>
    importWithChunkReload(() => importer().then((module) => ({ default: module[exportName] as M[K] }))),
  );
}

export function isStaleChunkLoadErrorMessage(message: string): boolean {
  return isStaleChunkLoadError(new Error(message));
}
