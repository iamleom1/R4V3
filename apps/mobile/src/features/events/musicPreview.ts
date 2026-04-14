import { Linking } from "react-native";

export async function openMusicPreview(url: string) {
  const normalized = String(url ?? "").trim();
  if (!normalized) {
    throw new Error("Missing preview URL.");
  }

  const supported = await Linking.canOpenURL(normalized);
  if (!supported) {
    throw new Error("Preview URL is not supported on this device.");
  }

  await Linking.openURL(normalized);
}
