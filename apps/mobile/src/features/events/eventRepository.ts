import { getSupabaseClient } from "../../lib/supabase";
import { env, hasTicketmasterEnv } from "../../lib/env";
import { trackEvent } from "../../lib/telemetry";
import { toUserFacingError } from "../../lib/userFacingErrors";
import { listPrimaryProfilePhotoUrls } from "../profile/photoRepository";
import type { EventRecord, RSVPStatus } from "../../types/domain";

type EventRow = {
  id: string;
  title: string;
  venue_name: string | null;
  city: string | null;
  starts_at: string;
  ends_at: string | null;
  genre_tags: string[] | null;
  source_primary: "ticketmaster" | "seatgeek" | "manual" | "posh" | "dice";
  is_featured: boolean;
  promotion_rank: number;
  featured_until: string | null;
  curation_note: string | null;
  flyer_url: string | null;
  music_preview_url: string | null;
  is_hidden?: boolean | null;
};

type EventRsvpRow = {
  event_id: string;
  status: RSVPStatus;
  looking_for_crew?: boolean | null;
};

export type EventAttendeePreview = {
  profileId: string;
  displayName: string;
  city: string | null;
  vibeTags: string[];
  rsvpStatus: RSVPStatus;
  profilePhotoUrl?: string | null;
};

export type EventCandidatePreview = {
  profileId: string;
  displayName: string;
  city: string | null;
  bio?: string | null;
  gender?: string | null;
  age?: number | null;
  vibeTags: string[];
  musicGenres: string[];
  overlapReason: string;
  discoveryLabel?: "Also going to this event" | "Into similar shows";
  softCandidate?: boolean;
  height?: string | null;
  education?: string | null;
  distanceKm?: number | null;
  connectionStatus?: "none" | "pending_outgoing" | "pending_incoming" | "matched";
  profilePhotoUrl?: string | null;
};

export type EventAudienceMetrics = {
  goingCount: number;
  lookingForCrewCount: number;
};

export type EventCrewRoom = {
  id: string;
  eventId: string;
  eventTitle?: string;
  title: string;
  meetupNote: string | null;
  sizeCap: number;
  isOpen: boolean;
  createdBy: string;
  createdAt: string;
  memberCount: number;
  isMember: boolean;
};

export type EventCrewMessage = {
  id: string;
  roomId: string;
  senderProfileId: string;
  body: string;
  createdAt: string;
};

const localDemoRsvpsByProfile: Record<string, Record<string, RSVPStatus>> = {};
const localDemoCrewVisibilityByProfile: Record<string, Record<string, boolean>> = {};

const DEFAULT_DISCOVERY_EVENT_LIMIT = 60;
const DISCOVERY_ALL_PAGE_SIZE = 200;
const DISCOVERY_WINDOW_DAYS = 365;

export async function listUpcomingEvents(limit: number | null = DEFAULT_DISCOVERY_EVENT_LIMIT, offset = 0): Promise<EventRecord[]> {
  const supabase = getSupabaseClient();
  const requestLimit = typeof limit === "number" ? Math.max(1, limit) : null;
  const requestOffset = Math.max(0, offset);
  const mergedCandidates: EventRecord[] = [];
  let loadedFromSupabase = false;

  if (supabase) {
    const eventsTable = supabase.from("events") as any;
    const windowStart = new Date();

    if (requestLimit === null) {
      let from = 0;

      while (true) {
        const to = from + DISCOVERY_ALL_PAGE_SIZE - 1;
        const { data, error } = await fetchDiscoveryEventRows(eventsTable, windowStart.toISOString(), from, to);

        if (error || !Array.isArray(data) || data.length === 0) {
          break;
        }

        mergedCandidates.push(...data.map(mapEventRow));
        loadedFromSupabase = true;

        if (data.length < DISCOVERY_ALL_PAGE_SIZE) {
          break;
        }

        from += data.length;
      }
    } else {
      let from = 0;
      const targetUniqueCount = requestOffset + requestLimit;

      while (true) {
        const to = from + DISCOVERY_ALL_PAGE_SIZE - 1;
        const { data, error } = await fetchDiscoveryEventRows(eventsTable, windowStart.toISOString(), from, to);

        if (error || !Array.isArray(data) || data.length === 0) {
          break;
        }

        mergedCandidates.push(...data.map(mapEventRow));
        loadedFromSupabase = true;

        const uniqueLoadedCount = dedupeAndRankEvents(mergedCandidates).length;
        if (uniqueLoadedCount >= targetUniqueCount || data.length < DISCOVERY_ALL_PAGE_SIZE) {
          break;
        }

        from += data.length;
      }
    }
  }

  if (!loadedFromSupabase) {
    const tmEvents = await listTicketmasterEvents((requestLimit ?? DISCOVERY_ALL_PAGE_SIZE) + requestOffset, DISCOVERY_WINDOW_DAYS);
    if (tmEvents.length > 0) {
      mergedCandidates.push(...tmEvents);
    }
  }

  const rankedEvents = dedupeAndRankEvents(mergedCandidates);
  return requestLimit === null ? rankedEvents : rankedEvents.slice(requestOffset, requestOffset + requestLimit);
}

async function fetchDiscoveryEventRows(eventsTable: any, windowStartIso: string, from: number, to: number) {
  const selectClause =
    "id,title,venue_name,city,starts_at,ends_at,genre_tags,source_primary,is_featured,promotion_rank,featured_until,curation_note,flyer_url,music_preview_url,is_hidden";

  const primaryResult = await eventsTable
    .select(selectClause)
    .gte("starts_at", windowStartIso)
    .eq("is_hidden", false)
    .order("starts_at", { ascending: true })
    .range(from, to);

  if (!isMissingHiddenColumnError(primaryResult.error)) {
    return primaryResult;
  }

  const fallbackResult = await eventsTable
    .select(selectClause)
    .gte("starts_at", windowStartIso)
    .order("starts_at", { ascending: true })
    .range(from, to);

  if (!Array.isArray(fallbackResult.data)) {
    return fallbackResult;
  }

  return {
    ...fallbackResult,
    data: fallbackResult.data.filter((row: EventRow) => !row.is_hidden)
  };
}

export async function listMyEventRsvps(profileId: string): Promise<Record<string, RSVPStatus>> {
  const supabase = getSupabaseClient();
  const localRsvps = localDemoRsvpsByProfile[profileId] ?? {};
  if (!supabase) {
    return { ...localRsvps };
  }

  const rsvpTable = supabase.from("event_rsvps") as any;
  const { data, error } = await rsvpTable.select("event_id,status").eq("profile_id", profileId);

  if (error || !Array.isArray(data)) {
    return { ...localRsvps };
  }

  const remoteRsvps = (data as EventRsvpRow[]).reduce<Record<string, RSVPStatus>>((acc, row) => {
    acc[row.event_id] = row.status;
    return acc;
  }, {});
  return { ...remoteRsvps, ...localRsvps };
}

export async function listMyCrewVisibility(profileId: string): Promise<Record<string, boolean>> {
  const supabase = getSupabaseClient();
  const localVisibility = localDemoCrewVisibilityByProfile[profileId] ?? {};
  if (!supabase) {
    return { ...localVisibility };
  }

  const rsvpTable = supabase.from("event_rsvps") as any;
  const { data, error } = await rsvpTable.select("event_id,looking_for_crew").eq("profile_id", profileId);
  if (error || !Array.isArray(data)) {
    return { ...localVisibility };
  }

  const remoteVisibility = (data as EventRsvpRow[]).reduce<Record<string, boolean>>((acc, row) => {
    acc[row.event_id] = Boolean(row.looking_for_crew);
    return acc;
  }, {});
  return { ...remoteVisibility, ...localVisibility };
}

export async function listEventAudienceMetrics(eventIds: string[]): Promise<Record<string, EventAudienceMetrics>> {
  const supabase = getSupabaseClient();
  const metrics: Record<string, EventAudienceMetrics> = {};

  for (const eventId of eventIds) {
    metrics[eventId] = { goingCount: 0, lookingForCrewCount: 0 };
  }

  if (!supabase) {
    return metrics;
  }

  const validEventIds = Array.from(new Set(eventIds.filter((eventId) => isUuidLike(eventId))));
  if (validEventIds.length === 0) {
    return metrics;
  }

  const rsvpTable = supabase.from("event_rsvps") as any;
  const { data, error } = await rsvpTable
    .select("event_id,status,looking_for_crew")
    .in("event_id", validEventIds)
    .eq("status", "going");

  if (error || !Array.isArray(data)) {
    return metrics;
  }

  for (const row of data as EventRsvpRow[]) {
    const current = metrics[row.event_id] ?? { goingCount: 0, lookingForCrewCount: 0 };
    current.goingCount += 1;
    if (row.looking_for_crew) {
      current.lookingForCrewCount += 1;
    }
    metrics[row.event_id] = current;
  }

  return metrics;
}

export async function upsertCrewVisibility(profileId: string, eventId: string, isLooking: boolean) {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return { ok: false as const, error: "Supabase is not configured." };
  }
  if (!isUuidLike(eventId)) {
    localDemoCrewVisibilityByProfile[profileId] = {
      ...(localDemoCrewVisibilityByProfile[profileId] ?? {}),
      [eventId]: isLooking
    };
    return { ok: true as const };
  }

  const rsvpTable = supabase.from("event_rsvps") as any;
  const { error } = await rsvpTable
    .upsert(
      {
        profile_id: profileId,
        event_id: eventId,
        status: "going" satisfies RSVPStatus,
        looking_for_crew: isLooking
      },
      { onConflict: "event_id,profile_id" }
    )
    .select("event_id")
    .single();

  if (error) {
    return { ok: false as const, error: toUserFacingError(error.message, "Couldn’t update crew visibility.") };
  }

  void trackEvent("crew_visibility_updated", {
    event_id: eventId,
    looking_for_crew: isLooking
  });

  return { ok: true as const };
}

export async function upsertEventRsvp(profileId: string, eventId: string, status: RSVPStatus) {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return { ok: false as const, error: "Supabase is not configured." };
  }
  if (!isUuidLike(eventId)) {
    // External provider events can use non-UUID IDs (for example Ticketmaster IDs prefixed with `tm-`).
    // Persist locally so actions still drive cross-screen behavior (Events -> Crew).
    localDemoRsvpsByProfile[profileId] = {
      ...(localDemoRsvpsByProfile[profileId] ?? {}),
      [eventId]: status
    };
    if (status !== "going") {
      localDemoCrewVisibilityByProfile[profileId] = {
        ...(localDemoCrewVisibilityByProfile[profileId] ?? {}),
        [eventId]: false
      };
    }
    return { ok: true as const };
  }

  const rsvpTable = supabase.from("event_rsvps") as any;
  const { error } = await rsvpTable
    .upsert(
      {
        profile_id: profileId,
        event_id: eventId,
        status
      },
      { onConflict: "event_id,profile_id" }
    )
    .select("id")
    .single();

  if (error) {
    return { ok: false as const, error: toUserFacingError(error.message, "Couldn’t update your RSVP.") };
  }
  if (status !== "going") {
    await rsvpTable.update({ looking_for_crew: false }).eq("profile_id", profileId).eq("event_id", eventId);
  }

  void trackEvent("event_rsvp_updated", {
    event_id: eventId,
    status
  });

  return { ok: true as const };
}

export async function listEventAttendeePreview(eventId: string, limit = 8): Promise<EventAttendeePreview[]> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return [];
  }
  if (!isUuidLike(eventId)) {
    return [];
  }

  const rsvpTable = supabase.from("event_rsvps") as any;
  const { data, error } = await rsvpTable
    .select(
      "status, profile_id, profiles:profile_id ( id, display_name, city, vibe_tags )"
    )
    .eq("event_id", eventId)
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (error || !Array.isArray(data)) {
    return [];
  }

  const rows = data
    .map((row: any) => {
      const profile = row.profiles;
      if (!profile?.id) {
        return null;
      }

      return {
        profileId: profile.id as string,
        displayName: (profile.display_name as string | null) ?? "R4V3 User",
        city: (profile.city as string | null) ?? null,
        vibeTags: Array.isArray(profile.vibe_tags) ? (profile.vibe_tags as string[]) : [],
        rsvpStatus: row.status as RSVPStatus
      } satisfies EventAttendeePreview;
    })
    .filter(Boolean) as EventAttendeePreview[];

  const photoUrls = await listPrimaryProfilePhotoUrls(rows.map((row) => row.profileId));
  return rows.map((row) => ({
    ...row,
    profilePhotoUrl: photoUrls[row.profileId] ?? null
  }));
}

export async function listEventCandidatePreview(
  eventId: string,
  viewerProfileId: string,
  limit = 6,
  _options?: { radiusKm?: number; expansionRadiusKm?: number; strictDistance?: boolean }
): Promise<EventCandidatePreview[]> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return [];
  }
  if (!isUuidLike(eventId)) {
    return [];
  }

  const blockTable = supabase.from("blocks") as any;
  const { data: blocks } = await blockTable
    .select("blocker_profile_id, blocked_profile_id")
    .or(`blocker_profile_id.eq.${viewerProfileId},blocked_profile_id.eq.${viewerProfileId}`);

  const blockedIds = new Set<string>();
  if (Array.isArray(blocks)) {
    for (const row of blocks as any[]) {
      if (row.blocker_profile_id === viewerProfileId && row.blocked_profile_id) {
        blockedIds.add(row.blocked_profile_id);
      }
      if (row.blocked_profile_id === viewerProfileId && row.blocker_profile_id) {
        blockedIds.add(row.blocker_profile_id);
      }
    }
  }

  const mapRows = async (rows: any[]) => {
    const mapped = rows
      .map((row: any) => {
        if (!row?.profile_id || blockedIds.has(row.profile_id)) {
          return null;
        }

        const vibeTags = Array.isArray(row.vibe_tags) ? (row.vibe_tags as string[]) : [];
        const musicGenres = Array.isArray(row.music_genres) ? (row.music_genres as string[]) : [];
        return {
          profileId: row.profile_id as string,
          displayName: (row.display_name as string | null) ?? "R4V3 User",
          city: (row.city as string | null) ?? null,
          bio: null,
          gender: null,
          age: null,
          vibeTags,
          musicGenres,
          overlapReason: buildOverlapReason(vibeTags, musicGenres),
          height: (row.height as string | null) ?? null,
          education: (row.education as string | null) ?? null,
          distanceKm: typeof row.distance_km === "number" ? row.distance_km : null,
          connectionStatus: (row.connection_status as EventCandidatePreview["connectionStatus"]) ?? "none",
          profilePhotoUrl: null
        } satisfies EventCandidatePreview;
      })
      .filter(Boolean) as EventCandidatePreview[];

    const details = await listProfileMatchDetails(mapped.map((row) => row.profileId));
    const photoUrls = await listPrimaryProfilePhotoUrls(mapped.map((row) => row.profileId));
    return mapped.map((row) => ({
      ...row,
      bio: details[row.profileId]?.bio ?? null,
      gender: details[row.profileId]?.gender ?? null,
      age: details[row.profileId]?.age ?? null,
      profilePhotoUrl: photoUrls[row.profileId] ?? null
    }));
  };

  const { data: rpcData, error: rpcError } = await (supabase.rpc as any)("list_event_crew_candidates", {
    p_event_id: eventId,
    p_limit: limit * 2
  });
  if (Array.isArray(rpcData) && !rpcError) {
    return (await mapRows(rpcData)).slice(0, limit);
  }

  const rsvpTable = supabase.from("event_rsvps") as any;
  const { data, error } = await rsvpTable
    .select("profile_id, looking_for_crew, profiles:profile_id ( id, display_name, bio, birthdate, gender, city, vibe_tags, music_genres, height, education )")
    .eq("event_id", eventId)
    .eq("status", "going")
    .neq("profile_id", viewerProfileId)
    .limit(limit * 2);

  if (error || !Array.isArray(data)) {
    return [];
  }

  const rows = data
    .map((row: any) => {
      const profile = row.profiles;
      if (!profile?.id || blockedIds.has(profile.id) || !row.looking_for_crew) {
        return null;
      }

      const vibeTags = Array.isArray(profile.vibe_tags) ? (profile.vibe_tags as string[]) : [];
      const musicGenres = Array.isArray(profile.music_genres) ? (profile.music_genres as string[]) : [];

      return {
        profileId: profile.id as string,
        displayName: (profile.display_name as string | null) ?? "R4V3 User",
        city: (profile.city as string | null) ?? null,
        bio: (profile.bio as string | null) ?? null,
        gender: (profile.gender as string | null) ?? null,
        age: computeAgeFromBirthdate(profile.birthdate as string | null),
        vibeTags,
        musicGenres,
        overlapReason: buildOverlapReason(vibeTags, musicGenres),
        height: (profile.height as string | null) ?? null,
        education: (profile.education as string | null) ?? null,
        distanceKm: null,
        connectionStatus: "none",
        profilePhotoUrl: null
      } satisfies EventCandidatePreview;
    })
    .filter(Boolean)
    .slice(0, limit) as EventCandidatePreview[];

  const details = await listProfileMatchDetails(rows.map((row) => row.profileId));
  const photoUrls = await listPrimaryProfilePhotoUrls(rows.map((row) => row.profileId));
  return rows.map((row) => ({
    ...row,
    bio: row.bio ?? details[row.profileId]?.bio ?? null,
    gender: row.gender ?? details[row.profileId]?.gender ?? null,
    age: row.age ?? details[row.profileId]?.age ?? null,
    profilePhotoUrl: photoUrls[row.profileId] ?? null
  }));
}

export async function listSeededEventCandidatePreview(
  event: EventRecord,
  viewerProfileId: string,
  limit = 8
): Promise<EventCandidatePreview[]> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    const demoSeeded: EventCandidatePreview[] = [
      {
        profileId: "seeded-demo-1",
        displayName: "Also Going Crew",
        city: event.city ?? "Los Angeles",
        bio: "Going to the same event and looking for crew.",
        gender: null,
        age: null,
        vibeTags: ["Community", "RSVP"],
        musicGenres: event.genreTags ?? ["EDM"],
        overlapReason: "Also going to this event",
        discoveryLabel: "Also going to this event",
        softCandidate: true
      },
      {
        profileId: "seeded-demo-2",
        displayName: "Similar Shows Link",
        city: event.city ?? "Los Angeles",
        bio: "Into similar shows and open to meeting up.",
        gender: null,
        age: null,
        vibeTags: ["House", "Afters"],
        musicGenres: event.genreTags ?? ["House"],
        overlapReason: "Into similar shows",
        discoveryLabel: "Into similar shows",
        softCandidate: true
      }
    ];
    return demoSeeded.slice(0, limit);
  }

  const seen = new Set<string>([viewerProfileId]);
  const results: EventCandidatePreview[] = [];
  const nowIso = new Date().toISOString();
  const thirtyDaysAgoIso = new Date(Date.now() - 1000 * 60 * 60 * 24 * 30).toISOString();
  const eventGenres = (event.genreTags ?? []).filter((tag) => tag.trim());

  const pushRow = (row: any, label: "Also going to this event" | "Into similar shows") => {
    const profile = row?.profiles;
    if (!profile?.id || seen.has(profile.id)) {
      return;
    }
    seen.add(profile.id);
    const vibeTags = Array.isArray(profile.vibe_tags) ? (profile.vibe_tags as string[]) : [];
    const musicGenres = Array.isArray(profile.music_genres) ? (profile.music_genres as string[]) : [];
    results.push({
      profileId: profile.id as string,
      displayName: (profile.display_name as string | null) ?? "R4V3 User",
      city: (profile.city as string | null) ?? null,
      bio: (profile.bio as string | null) ?? null,
      gender: (profile.gender as string | null) ?? null,
      age: computeAgeFromBirthdate(profile.birthdate as string | null),
      vibeTags,
      musicGenres,
      overlapReason: label,
      discoveryLabel: label,
      softCandidate: true,
      height: (profile.height as string | null) ?? null,
      education: (profile.education as string | null) ?? null,
      distanceKm: null,
      profilePhotoUrl: null
    });
  };

  const rsvpTable = supabase.from("event_rsvps") as any;
  const eventsTable = supabase.from("events") as any;

  if (isUuidLike(event.id)) {
    const { data: sameEventRows } = await rsvpTable
      .select("profile_id,profiles:profile_id(id,display_name,bio,birthdate,gender,city,vibe_tags,music_genres,height,education)")
      .eq("event_id", event.id).eq("status", "going")
      .neq("profile_id", viewerProfileId)
      .limit(limit * 2);
    if (Array.isArray(sameEventRows)) {
      for (const row of sameEventRows) {
        pushRow(row, "Also going to this event");
        if (results.length >= limit) {
          return results.slice(0, limit);
        }
      }
    }
  }

  let similarUpcomingIds: string[] = [];
  const upcomingQuery = eventsTable
    .select("id,city,genre_tags")
    .neq("id", event.id)
    .gte("starts_at", nowIso)
    .limit(30);
  const { data: upcomingEvents } = eventGenres.length > 0
    ? await upcomingQuery.overlaps("genre_tags", eventGenres)
    : await upcomingQuery.eq("city", event.city ?? "");
  if (Array.isArray(upcomingEvents)) {
    similarUpcomingIds = upcomingEvents.map((row: any) => row.id).filter(Boolean);
  }
  if (similarUpcomingIds.length > 0) {
    const { data: nearbyRows } = await rsvpTable
      .select("profile_id,profiles:profile_id(id,display_name,bio,birthdate,gender,city,vibe_tags,music_genres,height,education)")
      .in("event_id", similarUpcomingIds).eq("status", "going")
      .neq("profile_id", viewerProfileId)
      .limit(limit * 4);
    if (Array.isArray(nearbyRows)) {
      for (const row of nearbyRows) {
        pushRow(row, "Into similar shows");
        if (results.length >= limit) {
          return results.slice(0, limit);
        }
      }
    }
  }

  let recentSimilarIds: string[] = [];
  const recentQuery = eventsTable
    .select("id,city,genre_tags")
    .neq("id", event.id)
    .lt("starts_at", nowIso)
    .gte("starts_at", thirtyDaysAgoIso)
    .limit(30);
  const { data: recentEvents } = eventGenres.length > 0
    ? await recentQuery.overlaps("genre_tags", eventGenres)
    : await recentQuery.eq("city", event.city ?? "");
  if (Array.isArray(recentEvents)) {
    recentSimilarIds = recentEvents.map((row: any) => row.id).filter(Boolean);
  }
  if (recentSimilarIds.length > 0) {
    const { data: recentRows } = await rsvpTable
      .select("profile_id,profiles:profile_id(id,display_name,bio,birthdate,gender,city,vibe_tags,music_genres,height,education)")
      .in("event_id", recentSimilarIds).eq("status", "going")
      .neq("profile_id", viewerProfileId)
      .limit(limit * 4);
    if (Array.isArray(recentRows)) {
      for (const row of recentRows) {
        pushRow(row, "Into similar shows");
        if (results.length >= limit) {
          break;
        }
      }
    }
  }

  const sliced = results.slice(0, limit);
  const photoUrls = await listPrimaryProfilePhotoUrls(sliced.map((row) => row.profileId));
  return sliced.map((row) => ({
    ...row,
    profilePhotoUrl: photoUrls[row.profileId] ?? null
  }));
}

async function listProfileMatchDetails(profileIds: string[]): Promise<Record<string, { bio: string | null; gender: string | null; age: number | null }>> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return {};
  }

  const uniqueProfileIds = Array.from(new Set(profileIds.filter(Boolean)));
  if (uniqueProfileIds.length === 0) {
    return {};
  }

  const { data, error } = await (supabase.from("profiles") as any)
    .select("id,bio,gender,birthdate")
    .in("id", uniqueProfileIds);

  if (error || !Array.isArray(data)) {
    return {};
  }

  return data.reduce<Record<string, { bio: string | null; gender: string | null; age: number | null }>>((acc, row: any) => {
    if (row?.id) {
      acc[row.id] = {
        bio: typeof row.bio === "string" ? row.bio : null,
        gender: typeof row.gender === "string" ? row.gender : null,
        age: computeAgeFromBirthdate(typeof row.birthdate === "string" ? row.birthdate : null)
      };
    }
    return acc;
  }, {});
}

function computeAgeFromBirthdate(birthdate: string | null | undefined) {
  if (!birthdate) return null;
  const dob = new Date(birthdate);
  if (Number.isNaN(dob.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const monthDiff = today.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) age -= 1;
  return age >= 18 && age < 120 ? age : null;
}

export async function startEventCrewThreadSeed(profileId: string, eventId: string) {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return { ok: true as const, roomId: null as string | null, title: "Open crew" };
  }
  if (!isUuidLike(eventId)) {
    return { ok: true as const, roomId: null as string | null, title: "Open crew" };
  }

  const roomsTable = supabase.from("event_rooms") as any;
  const membersTable = supabase.from("event_room_members") as any;
  const { data: room, error: roomError } = await roomsTable
    .insert({
      event_id: eventId,
      created_by: profileId,
      title: "Open crew",
      size_cap: 6,
      is_open: true
    })
    .select("id")
    .single();

  if (roomError || !room?.id) {
    return { ok: false as const, error: toUserFacingError(roomError?.message, "Failed to create crew room.") };
  }

  const { error } = await membersTable
    .upsert(
      {
        room_id: room.id,
        profile_id: profileId
      },
      { onConflict: "room_id,profile_id" }
    )
    .select("room_id")
    .single();
  if (error) {
    return { ok: false as const, error: toUserFacingError(error.message, "Failed to create crew room.") };
  }
  return { ok: true as const, roomId: room.id as string, title: "Open crew" };
}

export async function listEventCrewRooms(eventId: string, viewerProfileId?: string | null): Promise<EventCrewRoom[]> {
  const supabase = getSupabaseClient();
  if (!supabase || !isUuidLike(eventId)) {
    return [];
  }

  const { data, error } = await ((supabase.from("event_rooms") as any)
    .select("id,event_id,title,meetup_note,size_cap,is_open,created_by,created_at,event_room_members(profile_id)")
    .eq("event_id", eventId)
    .order("created_at", { ascending: false }));

  if (error || !Array.isArray(data)) {
    return [];
  }

  return data.map((row: any) => {
    const members = Array.isArray(row.event_room_members) ? row.event_room_members : [];
    return {
      id: row.id,
      eventId: row.event_id,
      eventTitle: undefined,
      title: row.title ?? "Open crew",
      meetupNote: row.meetup_note ?? null,
      sizeCap: typeof row.size_cap === "number" ? row.size_cap : 6,
      isOpen: row.is_open !== false,
      createdBy: row.created_by,
      createdAt: row.created_at,
      memberCount: members.length,
      isMember: Boolean(viewerProfileId && members.some((member: any) => member?.profile_id === viewerProfileId))
    } satisfies EventCrewRoom;
  });
}

export async function listMyEventCrewRooms(profileId: string): Promise<EventCrewRoom[]> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return [];
  }

  const { data, error } = await ((supabase.from("event_room_members") as any)
    .select("room_id,event_rooms!inner(id,event_id,title,meetup_note,size_cap,is_open,created_by,created_at,events(title),event_room_members(profile_id))")
    .eq("profile_id", profileId)
    .order("created_at", { ascending: false, referencedTable: "event_rooms" }));

  if (error || !Array.isArray(data)) {
    return [];
  }

  return data
    .map((row: any) => {
      const room = row.event_rooms;
      const members = Array.isArray(room?.event_room_members) ? room.event_room_members : [];
      if (!room?.id || !room?.event_id) {
        return null;
      }
      return {
        id: room.id,
        eventId: room.event_id,
        eventTitle: room.events?.title ?? "Event",
        title: room.title ?? "Open crew",
        meetupNote: room.meetup_note ?? null,
        sizeCap: typeof room.size_cap === "number" ? room.size_cap : 6,
        isOpen: room.is_open !== false,
        createdBy: room.created_by,
        createdAt: room.created_at,
        memberCount: members.length,
        isMember: true
      } satisfies EventCrewRoom;
    })
    .filter(Boolean) as EventCrewRoom[];
}

export async function joinEventCrewRoom(roomId: string, profileId: string) {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return { ok: false as const, error: "Supabase is not configured." };
  }

  const { error } = await ((supabase.from("event_room_members") as any)
    .upsert({ room_id: roomId, profile_id: profileId }, { onConflict: "room_id,profile_id" }));

  if (error) {
    return { ok: false as const, error: toUserFacingError(error.message, "Failed to join crew group.") };
  }

  return { ok: true as const };
}

export async function listEventCrewMessages(roomId: string): Promise<EventCrewMessage[]> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const { data, error } = await ((supabase.from("event_room_messages") as any)
    .select("id,room_id,sender_profile_id,body,created_at")
    .eq("room_id", roomId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true }));

  if (error || !Array.isArray(data)) {
    throw new Error(error?.message ?? "Failed to load crew messages.");
  }

  return data.map((row: any) => ({
    id: row.id,
    roomId: row.room_id,
    senderProfileId: row.sender_profile_id,
    body: row.body,
    createdAt: row.created_at
  }));
}

export async function sendEventCrewMessage(input: { roomId: string; senderProfileId: string; body: string }) {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return { ok: false as const, error: "Supabase is not configured." };
  }

  const text = input.body.trim();
  if (!text) {
    return { ok: false as const, error: "Message cannot be empty." };
  }

  const { data, error } = await ((supabase.from("event_room_messages") as any)
    .insert({
      room_id: input.roomId,
      sender_profile_id: input.senderProfileId,
      body: text
    })
    .select("id,room_id,sender_profile_id,body,created_at")
    .single());

  if (error || !data) {
    return { ok: false as const, error: toUserFacingError(error?.message, "Failed to send crew message.") };
  }

  return {
    ok: true as const,
    message: {
      id: data.id,
      roomId: data.room_id,
      senderProfileId: data.sender_profile_id,
      body: data.body,
      createdAt: data.created_at
    } satisfies EventCrewMessage
  };
}

export async function createEventConnection(eventId: string, targetProfileId: string) {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return { ok: false as const, error: "Supabase is not configured." };
  }
  if (!isUuidLike(eventId) || !isUuidLike(targetProfileId)) {
    return { ok: true as const, matched: false, status: "pending" as const, threadId: null as string | null };
  }

  const { data, error } = await (supabase.rpc as any)("connect_for_event", {
    p_event_id: eventId,
    p_target_id: targetProfileId
  });
  if (error) {
    return { ok: false as const, error: toUserFacingError(error.message, "Couldn’t connect to this person right now.") };
  }
  const row = Array.isArray(data) ? data[0] : data;
  return {
    ok: true as const,
    matched: Boolean(row?.matched),
    status: (row?.status as "pending" | "matched") ?? "pending",
    threadId: (row?.thread_id as string | null) ?? null
  };
}

export async function hasEventCrewChat(profileId: string, eventId: string): Promise<boolean> {
  if (!isUuidLike(eventId)) {
    return false;
  }

  const supabase = getSupabaseClient();
  if (!supabase) {
    return false;
  }

  const matchesTable = supabase.from("matches") as any;
  const { data, error } = await matchesTable
    .select("id")
    .eq("event_id", eventId)
    .eq("mode", "community")
    .or(`profile_low_id.eq.${profileId},profile_high_id.eq.${profileId}`)
    .limit(1);

  if (error) {
    return false;
  }

  return Array.isArray(data) && data.length > 0;
}

function mapEventRow(row: EventRow): EventRecord {
  return {
    id: row.id,
    title: row.title,
    venueName: row.venue_name,
    city: row.city,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    genreTags: row.genre_tags ?? [],
    sourcePrimary: row.source_primary,
    isFeatured: row.is_featured,
    promotionRank: row.promotion_rank ?? 0,
    featuredUntil: row.featured_until,
    curationNote: row.curation_note,
    flyerUrl: row.flyer_url,
    musicPreviewUrl: row.music_preview_url
  };
}

function isMissingHiddenColumnError(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const maybeMessage = "message" in error ? error.message : null;
  const maybeCode = "code" in error ? error.code : null;
  return maybeCode === "42703" && typeof maybeMessage === "string" && maybeMessage.includes("is_hidden");
}

function isUuidLike(value: string | null | undefined) {
  if (!value) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function buildOverlapReason(vibeTags: string[], musicGenres: string[]) {
  if (vibeTags.length > 0) {
    return `Shared event + vibe: ${vibeTags[0]}`;
  }
  if (musicGenres.length > 0) {
    return `Shared event + genre: ${musicGenres[0]}`;
  }
  return "Shared event attendance";
}

type TicketmasterEvent = {
  id?: string;
  name?: string;
  images?: Array<{
    url?: string;
    width?: number;
    height?: number;
    ratio?: string;
    fallback?: boolean;
  }>;
  dates?: {
    start?: {
      dateTime?: string;
      localDate?: string;
      localTime?: string;
    };
  };
  _embedded?: {
    venues?: Array<{
      name?: string;
      city?: { name?: string };
    }>;
    attractions?: Array<{ name?: string; classifications?: Array<{ segment?: { name?: string }; genre?: { name?: string }; subGenre?: { name?: string } }> }>;
  };
  classifications?: Array<{
    segment?: { name?: string };
    genre?: { name?: string };
    subGenre?: { name?: string };
  }>;
};

async function listTicketmasterEvents(limit: number, daysAhead = 30): Promise<EventRecord[]> {
  if (!hasTicketmasterEnv()) {
    return [];
  }

  try {
    const requestSize = Math.max(24, Math.min(Math.ceil(limit / 2), 60));
    const radius = Number.isFinite(env.ticketmasterRadiusMiles) ? Math.max(50, Math.min(80, Math.round(env.ticketmasterRadiusMiles))) : 80;
    const now = new Date();
    const windowDays = Math.max(30, Math.min(120, Math.round(daysAhead)));
    const horizonFromNow = new Date(now.getTime() + 1000 * 60 * 60 * 24 * windowDays);
    const cities = resolveTicketmasterCities(env.ticketmasterCity);
    const responses = await Promise.all(
      cities.map((city) => {
        const params = new URLSearchParams({
          apikey: env.ticketmasterApiKey,
          size: String(requestSize),
          sort: "date,asc",
          countryCode: env.ticketmasterCountryCode || "US",
          classificationName: "music",
          radius: String(radius),
          unit: "miles",
          city,
          startDateTime: now.toISOString().replace(/\.\d{3}Z$/, "Z"),
          endDateTime: horizonFromNow.toISOString().replace(/\.\d{3}Z$/, "Z")
        });

        if (env.ticketmasterKeyword?.trim()) {
          params.set("keyword", env.ticketmasterKeyword.trim());
        }

        return fetchTicketmasterEvents(params);
      })
    );

    const broadMapped = dedupeTicketmasterEvents(responses.flat())
      .map(mapTicketmasterEvent)
      .filter((event): event is EventRecord => Boolean(event))
      .filter((event) => isSupportedDiscoveryCity(event.city))
      .filter((event) => isEdmDiscoveryEvent(event))
      .sort((a, b) => scoreTicketmasterEvent(b) - scoreTicketmasterEvent(a));
    return broadMapped.slice(0, Math.max(limit, 1));
  } catch {
    return [];
  }
}

async function fetchTicketmasterEvents(params: URLSearchParams): Promise<TicketmasterEvent[]> {
  const response = await fetch(`https://app.ticketmaster.com/discovery/v2/events.json?${params.toString()}`);
  if (!response.ok) {
    return [];
  }
  const payload = (await response.json()) as { _embedded?: { events?: TicketmasterEvent[] } };
  const events = payload?._embedded?.events ?? [];
  return Array.isArray(events) ? events : [];
}

function mapTicketmasterEvent(event: TicketmasterEvent): EventRecord | null {
  const id = event.id?.trim();
  const title = event.name?.trim();
  if (!id || !title) {
    return null;
  }

  const venue = event._embedded?.venues?.[0];
  const venueName = venue?.name?.trim() ?? null;
  const city = venue?.city?.name?.trim() ?? null;

  const startsAt =
    event.dates?.start?.dateTime?.trim() ||
    buildIsoFromLocal(event.dates?.start?.localDate, event.dates?.start?.localTime);
  if (!startsAt) {
    return null;
  }

  const genres = extractTicketmasterGenres(event);

  return {
    id: `tm-${id}`,
    title,
    venueName,
    city,
    startsAt,
    genreTags: genres.length > 0 ? genres : ["EDM"],
    sourcePrimary: "ticketmaster",
    isFeatured: false,
    promotionRank: 0,
    featuredUntil: null,
    curationNote: null,
    flyerUrl: extractTicketmasterFlyerUrl(event)
  };
}

function buildIsoFromLocal(localDate?: string, localTime?: string) {
  if (!localDate) {
    return null;
  }
  const time = localTime && /^\d{2}:\d{2}:\d{2}$/.test(localTime) ? localTime : "20:00:00";
  const parsed = new Date(`${localDate}T${time}`);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function extractTicketmasterGenres(event: TicketmasterEvent) {
  const tags = new Set<string>();
  const fromEvent = event.classifications ?? [];
  const fromAttractions = event._embedded?.attractions?.flatMap((a) => a.classifications ?? []) ?? [];

  for (const classification of [...fromEvent, ...fromAttractions]) {
    const segment = classification.segment?.name?.trim();
    const genre = classification.genre?.name?.trim();
    const subGenre = classification.subGenre?.name?.trim();
    if (segment && segment.toLowerCase() !== "music") tags.add(segment);
    if (genre && genre.toLowerCase() !== "undefined") tags.add(genre);
    if (subGenre && subGenre.toLowerCase() !== "undefined") tags.add(subGenre);
  }

  return Array.from(tags).slice(0, 3);
}

function extractTicketmasterFlyerUrl(event: TicketmasterEvent) {
  const images = Array.isArray(event.images) ? event.images : [];
  if (images.length === 0) {
    return null;
  }

  const ranked = [...images]
    .filter((image) => typeof image?.url === "string" && image.url.trim())
    .sort((a, b) => scoreTicketmasterImage(b) - scoreTicketmasterImage(a));

  return ranked[0]?.url?.trim() ?? null;
}

function scoreTicketmasterImage(image: NonNullable<TicketmasterEvent["images"]>[number]) {
  const ratio = image.ratio?.trim().toLowerCase() ?? "";
  const width = typeof image.width === "number" ? image.width : 0;
  const height = typeof image.height === "number" ? image.height : 0;
  const areaScore = width * height;

  let score = areaScore;
  if (ratio === "3_2") score += 5_000_000;
  else if (ratio === "16_9") score += 4_000_000;
  else if (ratio === "4_3") score += 3_000_000;
  if (image.fallback) score -= 500_000;

  return score;
}

const EDM_DISCOVERY_KEYWORDS = [
  "edm",
  "rave",
  "dance/electronic",
  "house",
  "tech house",
  "progressive house",
  "afro house",
  "techno",
  "melodic techno",
  "dubstep",
  "drum and bass",
  "dnb",
  "trance",
  "hardstyle",
  "bass",
  "future bass",
  "trap",
  "uk garage",
  "garage",
  "breakbeat",
  "afterhours",
  "afters",
  "all night long",
  "open to close",
  "b2b"
];

const TICKETMASTER_CROSSOVER_KEYWORDS = [
  "reggaeton"
];

const TICKETMASTER_PARTY_CONTEXT_KEYWORDS = [
  "rave",
  "party",
  "club",
  "night",
  "dj",
  "festival",
  "warehouse",
  "afters",
  "afterhours",
  "all night long",
  "open to close"
];

const NON_EDM_EXCLUSION_KEYWORDS = [
  "comedy",
  "podcast",
  "worship",
  "ballet",
  "orchestra",
  "symphony",
  "musical",
  "broadway",
  "play",
  "opera",
  "latin",
  "mariachi",
  "country",
  "folk",
  "hip hop",
  "hip-hop",
  "rap",
  "children",
  "tribute",
  "rock",
  "punk",
  "pop punk",
  "hardcore",
  "metal",
  "alternative",
  "indie",
  "emo",
  "grunge",
  "ska",
  "singer-songwriter",
  "americana"
];

const DEFAULT_SOCAL_TICKETMASTER_CITIES = [
  "Los Angeles",
  "Hollywood",
  "West Hollywood",
  "Long Beach",
  "Santa Ana",
  "Anaheim",
  "Costa Mesa",
  "Pomona",
  "Ontario",
  "San Bernardino",
  "Riverside",
  "Temecula",
  "San Diego",
  "Ventura",
  "Santa Barbara"
];

function isEdmOrRaveEvent(event: EventRecord) {
  const haystack = buildDiscoverySearchText(event);
  if (EDM_DISCOVERY_KEYWORDS.some((keyword) => haystack.includes(keyword))) {
    return true;
  }

  const hasCrossover = TICKETMASTER_CROSSOVER_KEYWORDS.some((keyword) => haystack.includes(keyword));
  const hasPartyContext = TICKETMASTER_PARTY_CONTEXT_KEYWORDS.some((keyword) => haystack.includes(keyword));
  return hasCrossover && hasPartyContext;
}

function scoreTicketmasterEvent(event: EventRecord) {
  const haystack = buildDiscoverySearchText(event);
  let score = 0;
  for (const keyword of EDM_DISCOVERY_KEYWORDS) {
    if (haystack.includes(keyword)) score += 10;
  }
  if (haystack.includes("dance/electronic")) score += 12;
  if (TICKETMASTER_CROSSOVER_KEYWORDS.some((keyword) => haystack.includes(keyword))) score += 4;
  if (TICKETMASTER_PARTY_CONTEXT_KEYWORDS.some((keyword) => haystack.includes(keyword))) score += 3;
  return score;
}

function shouldShowDiscoveryEvent(event: EventRecord) {
  if (event.sourcePrimary !== "ticketmaster") {
    return true;
  }
  return isSupportedDiscoveryCity(event.city) && isEdmDiscoveryEvent(event) && Boolean(event.flyerUrl?.trim());
}

function isEdmDiscoveryEvent(event: EventRecord) {
  const haystack = buildDiscoverySearchText(event);
  if (!isEdmOrRaveEvent(event)) {
    return false;
  }
  return !NON_EDM_EXCLUSION_KEYWORDS.some((keyword) => haystack.includes(keyword));
}

function buildDiscoverySearchText(event: Pick<EventRecord, "title" | "venueName" | "genreTags">) {
  return `${event.title} ${event.venueName ?? ""} ${(event.genreTags ?? []).join(" ")}`.toLowerCase();
}

function resolveTicketmasterCities(cityConfig: string) {
  const configured = cityConfig
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const ordered = configured.length > 0 ? [...configured, ...DEFAULT_SOCAL_TICKETMASTER_CITIES] : DEFAULT_SOCAL_TICKETMASTER_CITIES;
  return Array.from(new Set(ordered));
}

function isSupportedDiscoveryCity(city: string | null | undefined) {
  if (!city) {
    return false;
  }
  const normalized = normalizeDiscoveryCity(city);
  return DEFAULT_SOCAL_TICKETMASTER_CITIES.some((candidate) => normalizeDiscoveryCity(candidate) === normalized);
}

function normalizeDiscoveryCity(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function dedupeTicketmasterEvents(events: TicketmasterEvent[]) {
  const deduped = new Map<string, TicketmasterEvent>();
  for (const event of events) {
    const id = event.id?.trim();
    if (!id || deduped.has(id)) continue;
    deduped.set(id, event);
  }
  return Array.from(deduped.values());
}

function dedupeAndRankEvents(events: EventRecord[]) {
  const deduped = new Map<string, EventRecord>();

  for (const event of events) {
    const keys = getEventDedupKeys(event);
    let matchedKey: string | null = null;
    let existing: EventRecord | undefined;

    for (const key of keys) {
      const candidate = deduped.get(key);
      if (candidate) {
        matchedKey = key;
        existing = candidate;
        break;
      }
    }

    if (!existing) {
      for (const key of keys) {
        deduped.set(key, event);
      }
      continue;
    }

    const preferred = compareEventPriority(event, existing) < 0 ? event : existing;
    const secondary = preferred === event ? existing : event;
    const merged = mergeDuplicateEvents(preferred, secondary);
    const mergedKeys = Array.from(new Set([...(matchedKey ? [matchedKey] : []), ...getEventDedupKeys(existing), ...keys]));
    for (const key of mergedKeys) {
      deduped.set(key, merged);
    }
  }

  return Array.from(new Map(Array.from(deduped.values()).map((event) => [event.id, event])).values()).sort((a, b) => compareEventPriority(a, b));
}

function getEventDedupKeys(event: EventRecord) {
  const dayKey = getEventDayKey(event.startsAt);
  const timeBucket = getEventTimeBucket(event.startsAt);
  const normalizedTitle = normalizeEventTitle(event.title);
  const normalizedVenue = normalizeVenueName(event.venueName);
  const normalizedCity = normalizeEventToken(event.city);
  const titleCityKey = `${normalizedTitle}|${normalizedCity}|${dayKey}`;
  const titleVenueKey = normalizedVenue ? `${normalizedTitle}|${normalizedVenue}|${dayKey}` : null;
  const titleTimeKey = timeBucket !== null ? `${normalizedTitle}|${normalizedCity}|${timeBucket}` : null;
  return [titleVenueKey, titleTimeKey, titleCityKey].filter(Boolean) as string[];
}

function mergeDuplicateEvents(primary: EventRecord, duplicate: EventRecord): EventRecord {
  return {
    ...primary,
    endsAt: primary.endsAt ?? duplicate.endsAt ?? null,
    genreTags: mergeTags(primary.genreTags, duplicate.genreTags),
    curationNote: primary.curationNote ?? duplicate.curationNote ?? null,
    flyerUrl: primary.flyerUrl ?? duplicate.flyerUrl ?? null,
    musicPreviewUrl: primary.musicPreviewUrl ?? duplicate.musicPreviewUrl ?? null
  };
}

function mergeTags(primary?: string[], duplicate?: string[]) {
  const merged = [...(primary ?? []), ...(duplicate ?? [])]
    .map((tag) => tag.trim())
    .filter(Boolean);
  return Array.from(new Set(merged));
}

function getEventDayKey(startsAt: string) {
  const parsed = new Date(startsAt);
  return Number.isNaN(parsed.getTime()) ? startsAt : parsed.toISOString().slice(0, 10);
}

function getEventTimeBucket(startsAt: string) {
  const parsed = new Date(startsAt);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  const bucketMs = 1000 * 60 * 60 * 4;
  return Math.floor(parsed.getTime() / bucketMs);
}

function normalizeEventTitle(title: string) {
  const normalized = normalizeEventToken(title)
    .replace(/\b(ft|feat|featuring)\b/g, "")
    .replace(/\b(presents|presented by|pres\.)\b/g, "")
    .replace(/\b(official|tickets|rsvp|entry)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();

  return normalized;
}

function normalizeVenueName(value: string | null | undefined) {
  const normalized = normalizeEventToken(value)
    .replace(/\b(nightclub|club|theater|theatre|venue|hall|center|centre|arena|stadium)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();

  return normalized;
}

function normalizeEventToken(value: string | null | undefined) {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function compareEventPriority(a: EventRecord, b: EventRecord) {
  const aFeatured = isEventFeaturedForSort(a) ? 1 : 0;
  const bFeatured = isEventFeaturedForSort(b) ? 1 : 0;
  if (bFeatured !== aFeatured) {
    return bFeatured - aFeatured;
  }

  const rankDiff = (b.promotionRank ?? 0) - (a.promotionRank ?? 0);
  if (rankDiff !== 0) {
    return rankDiff;
  }

  const aHasFlyer = a.flyerUrl?.trim() ? 1 : 0;
  const bHasFlyer = b.flyerUrl?.trim() ? 1 : 0;
  if (bHasFlyer !== aHasFlyer) {
    return bHasFlyer - aHasFlyer;
  }

  const aSourceRank = getEventSourceRank(a);
  const bSourceRank = getEventSourceRank(b);
  if (aSourceRank !== bSourceRank) {
    return aSourceRank - bSourceRank;
  }

  const aTime = new Date(a.startsAt).getTime();
  const bTime = new Date(b.startsAt).getTime();
  if (aTime !== bTime) {
    return aTime - bTime;
  }

  return a.title.localeCompare(b.title);
}

function isEventFeaturedForSort(event: EventRecord) {
  if (!event.isFeatured) return false;
  if (!event.featuredUntil) return true;
  const featuredUntil = new Date(event.featuredUntil);
  return Number.isNaN(featuredUntil.getTime()) || featuredUntil.getTime() > Date.now();
}

function getEventSourceRank(event: EventRecord) {
  if (event.isFeatured) return 0;
  if ((event.promotionRank ?? 0) > 0 || event.curationNote) return 1;
  if (event.sourcePrimary === "manual") return 2;
  if (event.sourcePrimary === "ticketmaster" || event.sourcePrimary === "posh" || event.sourcePrimary === "dice") return 3;
  return 4;
}
