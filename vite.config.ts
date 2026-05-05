import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  const apiProxy = {
    '/api': {
      target: 'http://127.0.0.1:3000',
      changeOrigin: true,
    },
  };

  return {
    envPrefix: ['VITE_', 'NEXT_PUBLIC_'],
    plugins: [react(), tailwindcss()],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
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
      proxy: apiProxy,
    },
    preview: {
      allowedHosts: ['.run.app', 'localhost', '.localhost'],
      proxy: apiProxy,
    },
  };
});
