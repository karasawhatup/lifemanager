export type AppConfig = { url: string; anonKey: string; live: boolean };

/** config.js の URL と anon key。空ならデモモード。英語学習画面と同じ判定にする。 */
export function readConfig(): AppConfig {
  const fromWindow = window.LIFEMANAGER_CONFIG;
  const url = (fromWindow?.supabaseUrl || import.meta.env.VITE_SUPABASE_URL || "").trim();
  const anonKey = (fromWindow?.supabaseAnonKey || import.meta.env.VITE_SUPABASE_ANON_KEY || "").trim();
  const placeholder = /your_|xxx|example/i.test(url) || /your_|xxx/i.test(anonKey);
  const live = /^https?:\/\//.test(url) && anonKey.length >= 20 && !placeholder;
  return { url, anonKey, live };
}
