import React, { createContext, PropsWithChildren, useContext, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";

import { getSupabaseClient } from "../lib/supabase";
import {
  ensureProfileStubInSupabase,
  loadProfileDraftFromSupabase,
  upsertProfileDraftToSupabase
} from "../features/profile/profileRepository";
import { validateProfileDraft } from "../features/profile/profileDraftService";

export type AuthStatus = "loading" | "signed_out" | "authenticated";

export type ProfileDraft = {
  displayName: string;
  birthdate: string;
  city: string;
  bio: string;
  gender: string;
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

type AppStateValue = {
  authStatus: AuthStatus;
  session: Session | null;
  profileHydrationComplete: boolean;
  profileDraft: ProfileDraft;
  profileSaveStatus: "idle" | "saving" | "saved" | "error";
  profileSaveError: string | null;
  matchFilters: MatchFiltersDraft;
  signInDemo: (email: string) => void;
  signOut: () => Promise<void>;
  updateProfileDraft: (patch: Partial<ProfileDraft>) => void;
  updateMatchFilters: (patch: Partial<MatchFiltersDraft>) => void;
  saveProfileDraft: (options?: { requireFullValidation?: boolean; markOnboardingComplete?: boolean }) => Promise<boolean>;
  completeOnboarding: () => Promise<boolean>;
};

const defaultProfileDraft: ProfileDraft = {
  displayName: "",
  birthdate: "",
  city: "",
  bio: "",
  gender: "",
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
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setProfileHydrationComplete(!nextSession);
      setAuthStatus(nextSession ? "authenticated" : "signed_out");
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
        setProfileSaveStatus("error");
        setProfileSaveError(ensure.error);
        setProfileHydrationComplete(true);
        return;
      }

      const remoteDraft = await loadProfileDraftFromSupabase(session.user.id);
      if (remoteDraft) {
        setProfileDraft((prev) => ({
          ...prev,
          ...remoteDraft,
          guidelinesAccepted: prev.guidelinesAccepted
        }));
        setProfileSaveStatus("idle");
        setProfileSaveError(null);
      }
      setProfileHydrationComplete(true);
    }

    void hydrateProfile();
  }, [session?.user?.id]);

  async function persistProfileDraft(
    currentDraft: ProfileDraft,
    options?: { requireFullValidation?: boolean; markOnboardingComplete?: boolean }
  ) {
    const nextDraft: ProfileDraft = options?.markOnboardingComplete
      ? { ...currentDraft, onboardingCompleted: true }
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
        setProfileSaveStatus("idle");
        setProfileSaveError(null);
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
        return persistProfileDraft(profileDraft, options);
      },
      completeOnboarding: async () => {
        return persistProfileDraft(profileDraft, {
          requireFullValidation: true,
          markOnboardingComplete: true
        });
      }
    }),
    [authStatus, matchFilters, profileDraft, profileHydrationComplete, profileSaveError, profileSaveStatus, session]
  );

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

export function useAppState() {
  const ctx = useContext(AppStateContext);
  if (!ctx) {
    throw new Error("useAppState must be used within AppProvider");
  }
  return ctx;
}
