import type { ProfileDraft } from "../../app/AppProvider";

export type ProfileDraftValidation = {
  isValid: boolean;
  errors: string[];
};

export function validateProfileDraft(draft: ProfileDraft): ProfileDraftValidation {
  const errors: string[] = [];

  if (!draft.displayName.trim()) {
    errors.push("Display name is required.");
  }

  if (!draft.birthdate.trim()) {
    errors.push("Birthdate is required.");
  }

  if (!draft.gender.trim()) {
    errors.push("Gender is required.");
  }

  if (!draft.guidelinesAccepted) {
    errors.push("Guidelines must be accepted.");
  }

  return { isValid: errors.length === 0, errors };
}

export function toProfileUpsertInput(draft: ProfileDraft) {
  return {
    display_name: draft.displayName.trim(),
    bio: draft.bio.trim() || null,
    birthdate: draft.birthdate || null,
    city: draft.city.trim() || null,
    gender: draft.gender.trim() || null,
    interested_genders: draft.interestedGenders,
    preferred_age_min: typeof draft.preferredAgeMin === "number" ? draft.preferredAgeMin : null,
    preferred_age_max: typeof draft.preferredAgeMax === "number" ? draft.preferredAgeMax : null,
    height: draft.height.trim() || null,
    zodiac: draft.zodiac.trim() || null,
    education: draft.education.trim() || null,
    pronouns: draft.pronouns.trim() || null,
    smoking_preference: draft.smokingPreference.trim() || null,
    drinking_preference: draft.drinkingPreference.trim() || null,
    crew_style: draft.crewStyle.trim() || null,
    meetup_style: draft.meetupStyle.trim() || null,
    safety_note: draft.safetyNote.trim() || null,
    location_lat: typeof draft.locationLat === "number" ? draft.locationLat : null,
    location_lng: typeof draft.locationLng === "number" ? draft.locationLng : null,
    location_accuracy_meters: typeof draft.locationAccuracyMeters === "number" ? draft.locationAccuracyMeters : null,
    location_captured_at: draft.locationCapturedAt ?? null,
    community_mode_enabled: draft.communityModeEnabled,
    dating_mode_enabled: false,
    vibe_tags: draft.vibeTags,
    music_genres: draft.musicGenres,
    onboarding_completed: draft.onboardingCompleted
  };
}
