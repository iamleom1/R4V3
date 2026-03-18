import Constants from "expo-constants";

type ExpoExtra = {
  supabaseUrl?: string;
  supabaseAnonKey?: string;
  ticketmasterApiKey?: string;
  ticketmasterCountryCode?: string;
  ticketmasterCity?: string;
  ticketmasterKeyword?: string;
  ticketmasterRadiusMiles?: number;
};

const extra = (Constants.expoConfig?.extra ?? {}) as ExpoExtra;

export const env = {
  supabaseUrl: extra.supabaseUrl ?? "",
  supabaseAnonKey: extra.supabaseAnonKey ?? "",
  ticketmasterApiKey: extra.ticketmasterApiKey ?? "",
  ticketmasterCountryCode: extra.ticketmasterCountryCode ?? "US",
  ticketmasterCity: extra.ticketmasterCity ?? "Los Angeles",
  ticketmasterKeyword: extra.ticketmasterKeyword ?? "",
  ticketmasterRadiusMiles: Number(extra.ticketmasterRadiusMiles ?? 60)
};

export function hasSupabaseEnv() {
  return Boolean(env.supabaseUrl && env.supabaseAnonKey);
}

export function hasTicketmasterEnv() {
  return Boolean(env.ticketmasterApiKey);
}
