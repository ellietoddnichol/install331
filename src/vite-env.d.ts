/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  readonly VITE_APP_NAME: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface Window {
  __INSTALL331_PUBLIC_CONFIG__?: {
    supabaseUrl?: string;
    supabaseAnonKey?: string;
  };
}
