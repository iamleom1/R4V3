import React, { PropsWithChildren } from "react";

import { AppStateValue, MatchFiltersDraft, ProfileDraft } from "../app/AppProvider";

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

export function createTestAppState(overrides: Partial<AppStateValue> = {}): AppStateValue {
  return {
    authStatus: "signed_out",
    session: null,
    profileHydrationComplete: true,
    profileDraft: defaultProfileDraft,
    profileSaveStatus: "idle",
    profileSaveError: null,
    matchFilters: defaultMatchFilters,
    signInDemo: jest.fn(),
    signOut: jest.fn(async () => undefined),
    deleteAccount: jest.fn(async () => ({ ok: true as const })),
    updateProfileDraft: jest.fn(),
    updateMatchFilters: jest.fn(),
    saveProfileDraft: jest.fn(async () => true),
    completeOnboarding: jest.fn(async () => true),
    ...overrides
  };
}

export function PassthroughProvider({ children }: PropsWithChildren) {
  return <>{children}</>;
}
