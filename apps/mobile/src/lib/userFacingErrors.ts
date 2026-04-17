export function toUserFacingError(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : String(error ?? "").trim();
  const normalized = message.toLowerCase();

  if (!normalized) {
    return fallback;
  }

  if (
    normalized.includes("network request failed") ||
    normalized.includes("networkerror") ||
    normalized.includes("failed to fetch") ||
    normalized.includes("offline") ||
    normalized.includes("internet")
  ) {
    return "You appear to be offline. Check your connection and try again.";
  }

  if (normalized.includes("supabase is not configured")) {
    return "The app is not configured correctly for this environment.";
  }

  if (normalized.includes("auth_required") || normalized.includes("not authenticated") || normalized.includes("jwt")) {
    return "Your session expired. Sign in again and retry.";
  }

  if (normalized.includes("rate_limit") || normalized.includes("too many requests")) {
    return "You’re moving too fast. Wait a moment and try again.";
  }

  if (normalized.includes("duplicate_message")) {
    return "That message was already sent. Try a different message.";
  }

  if (normalized.includes("conversation_blocked") || normalized.includes("connection_blocked")) {
    return "This connection is unavailable because one of you has blocked the other.";
  }

  if (normalized.includes("invalid login credentials")) {
    return "That email/password combination didn’t work.";
  }

  if (normalized.includes("email not confirmed")) {
    return "Confirm your email first, then try logging in again.";
  }

  if (normalized.includes("user already registered")) {
    return "An account already exists for that email. Try logging in instead.";
  }

  return message || fallback;
}
