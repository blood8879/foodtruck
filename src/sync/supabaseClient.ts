/** Singleton Supabase client (auth + data). Null when sync is unconfigured. */
import { Platform } from "react-native";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { isSyncConfigured, supabaseConfig } from "./config";
import AsyncStorage from "@react-native-async-storage/async-storage";

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  if (!isSyncConfigured()) return null;
  if (client) return client;
  const isWeb = Platform.OS === "web";
  // Web: localStorage; native: AsyncStorage so login persists across restarts.
  const storage = isWeb
    ? typeof globalThis !== "undefined" && globalThis.localStorage
      ? globalThis.localStorage
      : undefined
    : AsyncStorage;
  client = createClient(supabaseConfig.url, supabaseConfig.anonKey, {
    auth: {
      storage,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: isWeb,
    },
  });
  return client;
}
