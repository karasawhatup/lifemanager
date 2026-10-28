/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
}

interface Window {
  LIFEMANAGER_CONFIG?: {
    supabaseUrl?: string;
    supabaseAnonKey?: string;
  };
}
