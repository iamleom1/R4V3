import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

import { getSupabaseClient } from "./supabase";
import { trackEvent } from "./telemetry";

let registeredProfileId: string | null = null;
let registeredPushToken: string | null = null;

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false
  })
});

export async function registerDevicePushToken(profileId: string) {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return { ok: false as const, error: "Supabase is not configured." };
  }

  if (!Device.isDevice) {
    return { ok: false as const, error: "Push notifications require a physical device." };
  }

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "default",
      importance: Notifications.AndroidImportance.DEFAULT
    });
  }

  let permission = await Notifications.getPermissionsAsync();
  if (!permission.granted) {
    permission = await Notifications.requestPermissionsAsync();
  }

  if (!permission.granted) {
    return { ok: false as const, error: "Notification permission was not granted." };
  }

  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ??
    Constants.easConfig?.projectId ??
    null;

  if (!projectId) {
    return { ok: false as const, error: "Expo project ID is missing." };
  }

  const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  const payload = {
    profile_id: profileId,
    expo_push_token: token,
    platform: Platform.OS === "ios" || Platform.OS === "android" ? Platform.OS : "unknown",
    project_id: projectId,
    last_seen_at: new Date().toISOString()
  };

  const { error } = await (supabase.from("device_push_tokens") as any).upsert(payload, {
    onConflict: "expo_push_token"
  });

  if (error) {
    return { ok: false as const, error: error.message };
  }

  registeredProfileId = profileId;
  registeredPushToken = token;

  void trackEvent("push_token_registered", {
    platform: payload.platform
  });

  return { ok: true as const, token };
}

export async function unregisterDevicePushToken(profileId?: string | null) {
  const supabase = getSupabaseClient();
  if (!supabase || !registeredPushToken) {
    registeredProfileId = profileId ?? null;
    return { ok: true as const };
  }

  let query = (supabase.from("device_push_tokens") as any).delete().eq("expo_push_token", registeredPushToken);
  if (profileId || registeredProfileId) {
    query = query.eq("profile_id", profileId ?? registeredProfileId);
  }

  const { error } = await query;
  if (error) {
    return { ok: false as const, error: error.message };
  }

  registeredPushToken = null;
  registeredProfileId = null;
  return { ok: true as const };
}

export function getPendingNotificationConversation(data: Record<string, unknown> | null | undefined) {
  const matchId = typeof data?.matchId === "string" ? data.matchId : null;
  const otherProfileId = typeof data?.otherProfileId === "string" ? data.otherProfileId : null;
  const title = typeof data?.title === "string" ? data.title : null;

  if (!matchId || !otherProfileId || !title) {
    return null;
  }

  return {
    matchId,
    otherProfileId,
    title
  };
}
