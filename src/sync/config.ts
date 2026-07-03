/**
 * Sync backend configuration. Populated from public env vars at build time:
 *   EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_ANON_KEY
 * (the anon key is safe on the client; RLS enforces access. service_role must
 * NEVER be shipped to the client.)
 *
 * When unconfigured the app stays fully local-only (M1 behavior) — sync is an
 * additive layer, not a hard dependency.
 */
export const supabaseConfig = {
  url: process.env.EXPO_PUBLIC_SUPABASE_URL ?? "",
  anonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "",
};

export function isSyncConfigured(): boolean {
  return supabaseConfig.url.length > 0 && supabaseConfig.anonKey.length > 0;
}
