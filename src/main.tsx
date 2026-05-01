import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { initSupabaseBrowserConfig } from './client/supabaseBrowser.ts';
import './index.css';

function installViteChunkLoadRecovery() {
  // When a deployment happens, an older HTML/app state can still be in memory and
  // lazy route imports may reference chunk filenames that no longer exist.
  // Recover by hard reloading once (guarded to avoid infinite loops).
  const guardKey = 'vite_chunk_recovery_reload_v1';

  const shouldReloadFor = (value: unknown): boolean => {
    const msg =
      value instanceof Error
        ? value.message
        : typeof value === 'string'
          ? value
          : value && typeof value === 'object' && 'message' in value
            ? String((value as any).message)
            : '';

    const s = String(msg || '');
    return (
      s.includes('Failed to fetch dynamically imported module') ||
      s.includes('Importing a module script failed') ||
      s.includes('ChunkLoadError') ||
      // Some browsers stringify the requested chunk URL.
      (s.includes('/assets/') && s.includes('.js') && (s.includes('404') || s.toLowerCase().includes('failed to fetch')))
    );
  };

  const reloadOnce = () => {
    try {
      if (sessionStorage.getItem(guardKey) === '1') return;
      sessionStorage.setItem(guardKey, '1');
    } catch {
      // ignore
    }
    window.location.reload();
  };

  window.addEventListener('unhandledrejection', (event) => {
    if (shouldReloadFor(event.reason)) reloadOnce();
  });

  window.addEventListener('error', (event) => {
    if (shouldReloadFor((event as any).error || event.message)) reloadOnce();
  });
}

installViteChunkLoadRecovery();

void initSupabaseBrowserConfig().then(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
});
