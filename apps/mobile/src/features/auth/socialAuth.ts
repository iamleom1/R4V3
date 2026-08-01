import * as AppleAuthentication from "expo-apple-authentication";
import * as Crypto from "expo-crypto";
import { getSupabaseClient } from "../../lib/supabase";

function createNonce() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

export async function signInWithApple() {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return { ok: false as const, error: "Apple sign in needs Supabase auth keys." };
  }

  const isAvailable = await AppleAuthentication.isAvailableAsync();
  if (!isAvailable) {
    return { ok: false as const, error: "Sign in with Apple is not available on this device." };
  }

  const rawNonce = createNonce();
  const hashedNonce = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, rawNonce);

  let credential: AppleAuthentication.AppleAuthenticationCredential;
  try {
    credential = await AppleAuthentication.signInAsync({
      requestedScopes: [AppleAuthentication.AppleAuthenticationScope.FULL_NAME, AppleAuthentication.AppleAuthenticationScope.EMAIL],
      nonce: hashedNonce
    });
  } catch (error) {
    if (isAppleAuthCanceled(error)) {
      return { ok: false as const, error: "Apple sign in was canceled." };
    }
    return {
      ok: false as const,
      error: toAppleAuthMessage(error)
    };
  }

  if (!credential.identityToken) {
    return { ok: false as const, error: "Apple did not return an identity token." };
  }

  const { error } = await supabase.auth.signInWithIdToken({
    provider: "apple",
    token: credential.identityToken,
    nonce: rawNonce
  });

  if (error) {
    return { ok: false as const, error: error.message };
  }

  return { ok: true as const };
}

function isAppleAuthCanceled(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }
  return error.message.toLowerCase().includes("canceled");
}

function toAppleAuthMessage(error: unknown) {
  if (error instanceof Error) {
    const normalized = error.message.trim();
    if (normalized.includes("Authorization attempt failed for an unknown reason")) {
      return "Apple sign in is not configured correctly for this build yet. Reinstall the latest build or verify the iOS Sign in with Apple capability for this app ID.";
    }
    if (normalized.length > 0) {
      return normalized;
    }
  }
  return "Apple sign in failed before authorization completed.";
}
