import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    envPrefix: ['VITE_', 'NEXT_PUBLIC_'],
    plugins: [react(), tailwindcss()],
    // AI provider keys must stay server-only — never define GEMINI_* / OPENAI_* for the client bundle.
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // Cloud Run and local proxies send a non-local Host; Vite blocks those hosts by default.
      // `.run.app` matches every default Cloud Run URL (service-hash.region.run.app).
      allowedHosts: ['.run.app', 'localhost', '.localhost'],
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify: file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // No `proxy`: this app embeds Vite as Express middleware on the same port (3000),
      // so Express handles `/api/*` directly. A proxy here would loop back to itself.
    },
    preview: {
      allowedHosts: ['.run.app', 'localhost', '.localhost'],
    },
  };
});
