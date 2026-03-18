import type { ExpoConfig } from "expo/config";

function readEnv(name: string, fallback = "") {
  return process.env[name] ?? fallback;
}

function readIntEnv(name: string, fallback: number) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) ? value : fallback;
}

const config: ExpoConfig = {
  name: "R4V3",
  slug: "r4v3",
  scheme: "r4v3",
  version: "0.1.0",
  runtimeVersion: {
    policy: "appVersion"
  },
  updates: {
    fallbackToCacheTimeout: 0
  },
  orientation: "portrait",
  userInterfaceStyle: "light",
  assetBundlePatterns: ["**/*"],
  ios: {
    supportsTablet: false,
    buildNumber: readEnv("EXPO_IOS_BUILD_NUMBER", "1"),
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
      NSPhotoLibraryUsageDescription: "R4V3 uses your photo library so you can upload profile photos.",
      NSLocationWhenInUseUsageDescription: "R4V3 uses your location to show nearby rave community matches."
    },
    bundleIdentifier: readEnv("EXPO_IOS_BUNDLE_IDENTIFIER", "com.r4v3.app")
  },
  android: {
    versionCode: readIntEnv("EXPO_ANDROID_VERSION_CODE", 1),
    permissions: ["ACCESS_COARSE_LOCATION", "ACCESS_FINE_LOCATION"],
    package: readEnv("EXPO_ANDROID_PACKAGE", "com.r4v3.app")
  },
  extra: {
    supabaseUrl: readEnv("EXPO_PUBLIC_SUPABASE_URL"),
    supabaseAnonKey: readEnv("EXPO_PUBLIC_SUPABASE_ANON_KEY"),
    ticketmasterApiKey: readEnv("EXPO_PUBLIC_TICKETMASTER_API_KEY"),
    ticketmasterCountryCode: readEnv("EXPO_PUBLIC_TICKETMASTER_COUNTRY_CODE", "US"),
    ticketmasterCity: readEnv("EXPO_PUBLIC_TICKETMASTER_CITY", "Los Angeles"),
    ticketmasterKeyword: readEnv("EXPO_PUBLIC_TICKETMASTER_KEYWORD"),
    ticketmasterRadiusMiles: readIntEnv("EXPO_PUBLIC_TICKETMASTER_RADIUS_MILES", 80)
  }
};

export default config;
