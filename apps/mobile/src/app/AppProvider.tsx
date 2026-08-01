import React, { createContext, PropsWithChildren, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";

import { getSupabaseClient } from "../lib/supabase";
import {
  ensureProfileStubInSupabase,
  deleteMyAccountFromSupabase,
  loadProfileDraftFromSupabase,
  upsertProfileDraftToSupabase
} from "../features/profile/profileRepository";
import { validateProfileDraft } from "../features/profile/profileDraftService";
import { registerDevicePushToken, unregisterDevicePushToken } from "../lib/pushNotifications";
import { installCrashReporting, installUnhandledRejectionReporting, recordError, trackEvent } from "../lib/telemetry";

export type AuthStatus = "loading" | "signed_out" | "authenticated";

export type ProfileDraft = {
  displayName: string;
  birthdate: string;
  city: string;
  bio: string;
  gender: string;
  interestedGenders: string[];
  preferredAgeMin: number | null;
  preferredAgeMax: number | null;
  height: string;
  zodiac: string;
  education: string;
  pronouns: string;
  smokingPreference: string;
  drinkingPreference: string;
  crewStyle: string;
  meetupStyle: string;
  safetyNote: string;
  locationLat: number | null;
  locationLng: number | null;
  locationAccuracyMeters: number | null;
  locationCapturedAt: string | null;
  vibeTags: string[];
  musicGenres: string[];
  communityModeEnabled: boolean;
  datingModeEnabled: boolean;
  guidelinesAccepted: boolean;
  onboardingCompleted: boolean;
};

export type MatchFiltersDraft = {
  distanceMiles: number;
  expansionDistanceMiles: number;
  strictDistance: boolean;
  musicTypes: string[];
  soberPreference: "all" | "sober" | "non_sober";
  groupPreference: "all" | "groups" | "individuals";
};

export type AppStateValue = {
  authStatus: AuthStatus;
  session: Session | null;
  profileHydrationComplete: boolean;
  profileDraft: ProfileDraft;
  profileSaveStatus: "idle" | "saving" | "saved" | "error";
  profileSaveError: string | null;
  matchFilters: MatchFiltersDraft;
  signInDemo: (email: string) => void;
  signOut: () => Promise<void>;
  deleteAccount: () => Promise<{ ok: boolean; error?: string }>;
  updateProfileDraft: (patch: Partial<ProfileDraft>) => void;
  updateMatchFilters: (patch: Partial<MatchFiltersDraft>) => void;
  saveProfileDraft: (options?: { requireFullValidation?: boolean; markOnboardingComplete?: boolean; draftOverride?: ProfileDraft }) => Promise<boolean>;
  completeOnboarding: () => Promise<boolean>;
};

const defaultProfileDraft: ProfileDraft = {
  displayName: "",
  birthdate: "",
  city: "",
  bio: "",
  gender: "",
  interestedGenders: [],
  preferredAgeMin: 21,
  preferredAgeMax: 35,
  height: "",
  zodiac: "",
  education: "",
  pronouns: "",
  smokingPreference: "",
  drinkingPreference: "",
  crewStyle: "",
  meetupStyle: "",
  safetyNote: "",
  locationLat: null,
  locationLng: null,
  locationAccuracyMeters: null,
  locationCapturedAt: null,
  vibeTags: [],
  musicGenres: [],
  communityModeEnabled: true,
  datingModeEnabled: false,
  guidelinesAccepted: false,
  onboardingCompleted: false
};

const defaultMatchFilters: MatchFiltersDraft = {
  distanceMiles: 25,
  expansionDistanceMiles: 100,
  strictDistance: true,
  musicTypes: ["House", "Techno"],
  soberPreference: "all",
  groupPreference: "all"
};

const AppStateContext = createContext<AppStateValue | null>(null);

export function AppProvider({ children }: PropsWithChildren) {
  const [authStatus, setAuthStatus] = useState<AuthStatus>("loading");
  const [session, setSession] = useState<Session | null>(null);
  const [profileHydrationComplete, setProfileHydrationComplete] = useState(true);
  const [profileDraft, setProfileDraft] = useState<ProfileDraft>(defaultProfileDraft);
  const [profileSaveStatus, setProfileSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [profileSaveError, setProfileSaveError] = useState<string | null>(null);
  const [matchFilters, setMatchFilters] = useState<MatchFiltersDraft>(defaultMatchFilters);
  const pushProfileIdRef = useRef<string | null>(null);
  const lastAutosavedProfileRef = useRef<string>("");

  useEffect(() => {
    installCrashReporting();
    installUnhandledRejectionReporting();
  }, []);

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) {
      setAuthStatus("signed_out");
      return;
    }

    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) {
        return;
      }
      setSession(data.session);
      setProfileHydrationComplete(!data.session);
      setAuthStatus(data.session ? "authenticated" : "signed_out");
      if (data.session) {
        void trackEvent("auth_session_restored", { source: "app_boot" });
      }
    });

    const { data: sub } = supabase.auth.onAuthStateChange((event, nextSession) => {
      setSession(nextSession);
      setProfileHydrationComplete(!nextSession);
      setAuthStatus(nextSession ? "authenticated" : "signed_out");
      if (nextSession) {
        void trackEvent("auth_authenticated", { source: "auth_state_change" });
      }
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    async function hydrateProfile() {
      if (!session?.user?.id) {
        setProfileHydrationComplete(true);
        return;
      }

      setProfileHydrationComplete(false);

      const ensure = await ensureProfileStubInSupabase({
        id: session.user.id,
        email: session.user.email
      });

      if (!ensure.ok) {
        void recordError(ensure.error, { source: "ensure_profile_stub" });
        setProfileSaveStatus("error");
        setProfileSaveError(ensure.error);
        setProfileHydrationComplete(true);
        return;
      }

      const remoteDraft = await loadProfileDraftFromSupabase(session.user.id);
      if (remoteDraft) {
        const hydratedDraft = {
          ...defaultProfileDraft,
          ...remoteDraft
        };
        setProfileDraft(hydratedDraft);
        lastAutosavedProfileRef.current = JSON.stringify(hydratedDraft);
        setProfileSaveStatus("idle");
        setProfileSaveError(null);
      } else {
        const seededDraft = {
          ...defaultProfileDraft,
          displayName: deriveDisplayNameFromEmail(session.user.email)
        };
        setProfileDraft(seededDraft);
        lastAutosavedProfileRef.current = JSON.stringify(seededDraft);
      }
      setProfileHydrationComplete(true);
    }

    void hydrateProfile();
  }, [session?.user?.id]);

  useEffect(() => {
    if (!session?.user?.id || !profileHydrationComplete) {
      return;
    }

    const serializedDraft = JSON.stringify(profileDraft);
    if (serializedDraft === lastAutosavedProfileRef.current) {
      return;
    }

    const timeout = setTimeout(() => {
      void (async () => {
        setProfileSaveStatus("saving");
        setProfileSaveError(null);

        const result = await upsertProfileDraftToSupabase(session.user!.id, profileDraft);
        if (!result.ok) {
          void recordError(result.error, { source: "autosave_profile_draft" });
          setProfileSaveStatus("error");
          setProfileSaveError(result.error);
          return;
        }

        lastAutosavedProfileRef.current = serializedDraft;
        setProfileSaveStatus("saved");
      })();
    }, 600);

    return () => clearTimeout(timeout);
  }, [profileDraft, profileHydrationComplete, session?.user?.id]);

  useEffect(() => {
    let active = true;

    async function syncPushToken() {
      const nextProfileId = session?.user?.id ?? null;
      const previousProfileId = pushProfileIdRef.current;

      if (!nextProfileId) {
        if (previousProfileId) {
          await unregisterDevicePushToken(previousProfileId);
        }
        if (active) {
          pushProfileIdRef.current = null;
        }
        return;
      }

      if (previousProfileId && previousProfileId !== nextProfileId) {
        await unregisterDevicePushToken(previousProfileId);
      }

      const result = await registerDevicePushToken(nextProfileId);
      if (!result.ok) {
        void trackEvent("push_token_registration_skipped", { reason: result.error });
        return;
      }

      if (active) {
        pushProfileIdRef.current = nextProfileId;
      }
    }

    void syncPushToken();
    return () => {
      active = false;
    };
  }, [session?.user?.id]);

  async function persistProfileDraft(
    currentDraft: ProfileDraft,
    options?: { requireFullValidation?: boolean; markOnboardingComplete?: boolean }
  ) {
    const nextDraft: ProfileDraft = options?.markOnboardingComplete
      ? { ...currentDraft, onboardingCompleted: true, guidelinesAccepted: true }
      : currentDraft;

    if (options?.requireFullValidation) {
      const validation = validateProfileDraft(nextDraft);
      if (!validation.isValid) {
        setProfileSaveStatus("error");
        setProfileSaveError(validation.errors[0] ?? "Profile validation failed.");
        return false;
      }
    }

    setProfileSaveStatus("saving");
    setProfileSaveError(null);

    if (!session?.user?.id) {
      setProfileDraft(nextDraft);
      setProfileSaveStatus("saved");
      return true;
    }

    const result = await upsertProfileDraftToSupabase(session.user.id, nextDraft);
    if (!result.ok) {
      void recordError(result.error, { source: "save_profile_draft" });
      setProfileSaveStatus("error");
      setProfileSaveError(result.error);
      return false;
    }

    setProfileDraft(nextDraft);
    setProfileSaveStatus("saved");
    return true;
  }

  const value = useMemo<AppStateValue>(
    () => ({
      authStatus,
      session,
      profileHydrationComplete,
      profileDraft,
      profileSaveStatus,
      profileSaveError,
      matchFilters,
      signInDemo: (_email: string) => {
        setSession(null);
        setAuthStatus("authenticated");
      },
      signOut: async () => {
        const supabase = getSupabaseClient();
        if (supabase) {
          await supabase.auth.signOut();
        }
        setSession(null);
        setAuthStatus("signed_out");
        setProfileDraft(defaultProfileDraft);
        lastAutosavedProfileRef.current = JSON.stringify(defaultProfileDraft);
        setProfileSaveStatus("idle");
        setProfileSaveError(null);
      },
      deleteAccount: async () => {
        if (!session?.user?.id) {
          return { ok: false as const, error: "No authenticated user." };
        }
        const result = await deleteMyAccountFromSupabase(session.user.id);
        if (!result.ok) {
          void recordError(result.error, { source: "delete_account" });
          return result;
        }
        const supabase = getSupabaseClient();
        if (supabase) {
          await supabase.auth.signOut().catch(() => undefined);
        }
        setSession(null);
        setAuthStatus("signed_out");
        setProfileDraft(defaultProfileDraft);
        lastAutosavedProfileRef.current = JSON.stringify(defaultProfileDraft);
        setProfileSaveStatus("idle");
        setProfileSaveError(null);
        return result;
      },
      updateProfileDraft: (patch) => {
        setProfileDraft((prev) => ({ ...prev, ...patch }));
        setProfileSaveStatus("idle");
        setProfileSaveError(null);
      },
      updateMatchFilters: (patch) => {
        setMatchFilters((prev) => ({ ...prev, ...patch }));
      },
      saveProfileDraft: async (options) => {
        return persistProfileDraft(options?.draftOverride ?? profileDraft, options);
      },
      completeOnboarding: async () => {
        const ok = await persistProfileDraft(profileDraft, {
          requireFullValidation: true,
          markOnboardingComplete: true
        });
        if (ok) {
          void trackEvent("onboarding_completed", {
            vibe_count: profileDraft.vibeTags.length,
            genre_count: profileDraft.musicGenres.length
          });
        }
        return ok;
      }
    }),
    [authStatus, matchFilters, profileDraft, profileHydrationComplete, profileSaveError, profileSaveStatus, session]
  );

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

function deriveDisplayNameFromEmail(email?: string | null) {
  if (!email) {
    return "";
  }

  const local = email.split("@")[0] ?? "";
  const cleaned = local.replace(/[._-]+/g, " ").trim();
  if (!cleaned) {
    return "";
  }

  return cleaned
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join("")
    .slice(0, 40);
}

export function useAppState() {
  const ctx = useContext(AppStateContext);
  if (!ctx) {
    throw new Error("useAppState must be used within AppProvider");
  }
  return ctx;
}
