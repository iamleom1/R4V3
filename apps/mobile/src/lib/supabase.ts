import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";
import { env, hasSupabaseEnv } from "./env";

let client: ReturnType<typeof createClient> | null = null;

export function getSupabaseClient() {
  if (!hasSupabaseEnv()) {
    return null;
  }

  if (!client) {
    client = createClient(env.supabaseUrl, env.supabaseAnonKey, {
      auth: {
        storage: AsyncStorage,
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false
      }
    });
  }

  return client;
}
