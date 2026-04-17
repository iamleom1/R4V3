import { getSupabaseClient } from "../../lib/supabase";
import { toUserFacingError } from "../../lib/userFacingErrors";
import type { SwipeDecision } from "../../types/domain";
import { createEventConnection, listEventCandidatePreview } from "../events/eventRepository";

export type MatchCandidate = {
  id: string;
  name: string;
  age: number | null;
  gender?: string | null;
  city: string;
  bio: string;
  vibeTags: string[];
  eventId: string | null;
  eventName: string;
  overlapReason: string;
  discoveryLabel?: "Also going to this event" | "Into similar shows";
  softCandidate?: boolean;
  connectionStatus?: "none" | "pending_outgoing" | "pending_incoming" | "matched";
  mode: "community" | "dating";
  distanceKm?: number | null;
  height?: string | null;
  education?: string | null;
  jobTitle?: string | null;
  soberPreference?: "sober" | "non_sober" | "mixed" | null;
  connectionType?: "individual" | "group" | null;
  previousEvents?: string[];
  profilePhotoUrl?: string | null;
};

type ViewerEventRow = {
  event_id: string;
  status: string;
  looking_for_crew?: boolean | null;
  events: {
    id: string;
    title: string;
  } | null;
};

export async function listMatchStackCandidates(
  viewerProfileId: string,
  limit = 20,
  _options?: { radiusMiles?: number; expansionRadiusMiles?: number; strictDistance?: boolean; requireViewerLocation?: boolean }
): Promise<MatchCandidate[]> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const rsvpTable = supabase.from("event_rsvps") as any;
  const { data, error } = await rsvpTable
    .select("event_id,status,looking_for_crew, events:event_id ( id, title )")
    .eq("profile_id", viewerProfileId)
    .eq("status", "going")
    .eq("looking_for_crew", true)
    .limit(8);

  if (error || !Array.isArray(data)) {
    throw new Error(error?.message ?? "Failed to load crew candidates.");
  }

  const viewerEvents = data as ViewerEventRow[];
  const candidates: MatchCandidate[] = [];
  const seenProfiles = new Set<string>();
  for (const row of viewerEvents) {
    if (!row.event_id || !row.events?.title) {
      continue;
    }

    const previews = await listEventCandidatePreview(row.event_id, viewerProfileId, 8);
    for (const preview of previews) {
      if (seenProfiles.has(preview.profileId)) {
        continue;
      }

      seenProfiles.add(preview.profileId);
      candidates.push({
        id: preview.profileId,
        name: preview.displayName,
        age: preview.age ?? null,
        gender: preview.gender ?? null,
        city: preview.city ?? "City hidden",
        bio: preview.bio?.trim() || "No bio yet.",
        vibeTags: preview.vibeTags,
        eventId: row.event_id,
        eventName: row.events.title,
        overlapReason: preview.overlapReason,
        discoveryLabel: preview.discoveryLabel,
        softCandidate: preview.softCandidate,
        connectionStatus: preview.connectionStatus ?? "none",
        mode: "community",
        distanceKm: preview.distanceKm ?? null,
        height: preview.height,
        education: preview.education,
        jobTitle: null,
        soberPreference: null,
        connectionType: "individual",
        previousEvents: preview.distanceKm != null ? [`${Math.round(preview.distanceKm)} km away`] : [],
        profilePhotoUrl: preview.profilePhotoUrl ?? null
      });

      if (candidates.length >= limit) {
        return candidates;
      }
    }
  }

  return candidates;
}

export async function createSwipeDecision(input: {
  actorProfileId: string;
  targetProfileId: string;
  eventId?: string | null;
  mode?: "community" | "dating";
  decision: SwipeDecision;
}) {
  if (!isUuidLike(input.targetProfileId)) {
    // Demo/local fallback cards can use non-UUID ids (e.g. "c1"); skip backend RPC.
    return {
      ok: true as const,
      matchCreated: false,
      matchId: null as string | null
    };
  }

  const supabase = getSupabaseClient();
  if (!supabase) {
    return { ok: false as const, error: "Supabase is not configured." };
  }

  if (input.decision !== "like") {
    return { ok: true as const, matchCreated: false, matchId: null as string | null };
  }

  if (!isUuidLike(input.eventId ?? null)) {
    return { ok: true as const, matchCreated: false, matchId: null as string | null };
  }

  const result = await createEventConnection(input.eventId!, input.targetProfileId);
  if (!result.ok) {
    return { ok: false as const, error: toUserFacingError(result.error, "Couldn’t send that crew request.") };
  }

  return {
    ok: true as const,
    matchCreated: result.matched,
    matchId: result.threadId
  };
}

function isUuidLike(value: string | null | undefined) {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  );
}
