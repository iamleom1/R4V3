import { getSupabaseClient } from "../../lib/supabase";
import type { ProfileDraft } from "../../app/AppProvider";
import { toProfileUpsertInput } from "./profileDraftService";

type ProfileRow = {
  display_name: string | null;
  birthdate: string | null;
  city: string | null;
  bio: string | null;
  gender: string | null;
  interested_genders: string[] | null;
  preferred_age_min: number | null;
  preferred_age_max: number | null;
  height: string | null;
  zodiac: string | null;
  education: string | null;
  pronouns: string | null;
  smoking_preference: string | null;
  drinking_preference: string | null;
  crew_style: string | null;
  meetup_style: string | null;
  safety_note: string | null;
  location_lat: number | null;
  location_lng: number | null;
  location_accuracy_meters: number | null;
  location_captured_at: string | null;
  vibe_tags: string[] | null;
  music_genres: string[] | null;
  community_mode_enabled: boolean | null;
  dating_mode_enabled: boolean | null;
  onboarding_completed: boolean | null;
};

type AuthLikeUser = {
  id: string;
  email?: string | null;
};

export async function loadProfileDraftFromSupabase(userId: string): Promise<Partial<ProfileDraft> | null> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return null;
  }

  const { data, error } = await supabase
    .from("profiles")
    .select(
      "display_name,birthdate,city,bio,gender,interested_genders,preferred_age_min,preferred_age_max,height,zodiac,education,pronouns,smoking_preference,drinking_preference,crew_style,meetup_style,safety_note,location_lat,location_lng,location_accuracy_meters,location_captured_at,vibe_tags,music_genres,community_mode_enabled,dating_mode_enabled,onboarding_completed"
    )
    .eq("id", userId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return mapRowToDraft(data);
}

export async function ensureProfileStubInSupabase(user: AuthLikeUser) {
  const existing = await loadProfileDraftFromSupabase(user.id);
  if (existing) {
    return { ok: true as const, created: false as const };
  }

  const supabase = getSupabaseClient();
  if (!supabase) {
    return { ok: false as const, error: "Supabase is not configured." };
  }

  const seedName = deriveDisplayNameFromEmail(user.email) ?? "R4V3 User";
  const profilesTable = supabase.from("profiles") as any;
  const { error } = await profilesTable
    .upsert({
      id: user.id,
      display_name: seedName,
      community_mode_enabled: true,
      dating_mode_enabled: false,
      onboarding_completed: false
    })
    .select("id")
    .single();

  if (error) {
    return { ok: false as const, error: error.message };
  }

  return { ok: true as const, created: true as const };
}

export async function upsertProfileDraftToSupabase(userId: string, draft: ProfileDraft) {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return { ok: false as const, error: "Supabase is not configured." };
  }

  const payload = {
    id: userId,
    ...toProfileUpsertInput(draft)
  };

  const profilesTable = supabase.from("profiles") as any;
  const { error } = await profilesTable.upsert(payload).select("id").single();

  if (error) {
    return { ok: false as const, error: error.message };
  }

  return { ok: true as const };
}

export async function deleteMyAccountFromSupabase() {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return { ok: false as const, error: "Supabase is not configured." };
  }

  const { data, error } = await (supabase.rpc as any)("delete_my_account");
  if (error || !data) {
    return { ok: false as const, error: error?.message ?? "Failed to delete account." };
  }

  return { ok: true as const };
}

function mapRowToDraft(row: ProfileRow): Partial<ProfileDraft> {
  return {
    displayName: row.display_name ?? "",
    birthdate: row.birthdate ?? "",
    city: row.city ?? "",
    bio: row.bio ?? "",
    gender: row.gender ?? "",
    interestedGenders: row.interested_genders ?? [],
    preferredAgeMin: typeof row.preferred_age_min === "number" ? row.preferred_age_min : 21,
    preferredAgeMax: typeof row.preferred_age_max === "number" ? row.preferred_age_max : 35,
    height: row.height ?? "",
    zodiac: row.zodiac ?? "",
    education: row.education ?? "",
    pronouns: row.pronouns ?? "",
    smokingPreference: row.smoking_preference ?? "",
    drinkingPreference: row.drinking_preference ?? "",
    crewStyle: row.crew_style ?? "",
    meetupStyle: row.meetup_style ?? "",
    safetyNote: row.safety_note ?? "",
    locationLat: typeof row.location_lat === "number" ? row.location_lat : null,
    locationLng: typeof row.location_lng === "number" ? row.location_lng : null,
    locationAccuracyMeters: typeof row.location_accuracy_meters === "number" ? row.location_accuracy_meters : null,
    locationCapturedAt: row.location_captured_at ?? null,
    vibeTags: row.vibe_tags ?? [],
    musicGenres: row.music_genres ?? [],
    communityModeEnabled: row.community_mode_enabled ?? true,
    datingModeEnabled: row.dating_mode_enabled ?? false,
    onboardingCompleted: row.onboarding_completed ?? false
  };
}

function deriveDisplayNameFromEmail(email?: string | null) {
  if (!email) {
    return null;
  }

  const local = email.split("@")[0] ?? "";
  const cleaned = local.replace(/[._-]+/g, " ").trim();
  if (!cleaned) {
    return null;
  }

  const title = cleaned
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(" ");

  return title.slice(0, 40);
}
