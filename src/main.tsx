import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import {assertSupabaseViteEnv, loadSupabaseRuntimeConfig} from './lib/supabase.ts';

async function bootstrap() {
  await loadSupabaseRuntimeConfig();
  assertSupabaseViteEnv();

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

void bootstrap();
