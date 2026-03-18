import { getSupabaseClient } from "../../lib/supabase";
import { env, hasTicketmasterEnv } from "../../lib/env";
import type { EventRecord, RSVPStatus } from "../../types/domain";

type EventRow = {
  id: string;
  title: string;
  venue_name: string | null;
  city: string | null;
  starts_at: string;
  genre_tags: string[] | null;
  source_primary: "ticketmaster" | "seatgeek" | "manual";
};

type EventRsvpRow = {
  event_id: string;
  status: RSVPStatus;
  looking_for_crew?: boolean | null;
};

const demoEventsFallback: EventRecord[] = [
  {
    id: "sample-1",
    title: "LicknDip",
    city: "Los Angeles",
    venueName: "The Circle",
    startsAt: "2026-03-13T05:00:00.000Z",
    genreTags: ["House", "Tech House"],
    sourcePrimary: "manual"
  },
  {
    id: "sample-2",
    title: "Inland Groove",
    city: "Riverside",
    venueName: "Mezcal Ultra Lounge",
    startsAt: "2026-03-20T05:00:00.000Z",
    genreTags: ["House", "Latin House"],
    sourcePrimary: "manual"
  },
  {
    id: "sample-3",
    title: "Blind Tiger",
    city: "San Diego",
    venueName: "Blind Tiger",
    startsAt: "2026-03-21T04:00:00.000Z",
    genreTags: ["Bass", "Dubstep"],
    sourcePrimary: "manual"
  },
  {
    id: "sample-4",
    title: "Exchange LA",
    city: "Los Angeles",
    venueName: "Exchange LA",
    startsAt: "2026-03-27T05:00:00.000Z",
    genreTags: ["Progressive House", "Tech House"],
    sourcePrimary: "manual"
  },
  {
    id: "sample-5",
    title: "Sound",
    city: "Los Angeles",
    venueName: "Sound Nightclub",
    startsAt: "2026-03-28T05:00:00.000Z",
    genreTags: ["House", "Melodic Techno"],
    sourcePrimary: "manual"
  },
  {
    id: "sample-6",
    title: "Circoloco",
    city: "Los Angeles",
    venueName: "Grand Park",
    startsAt: "2026-04-04T02:00:00.000Z",
    genreTags: ["Techno", "House"],
    sourcePrimary: "manual"
  },
  {
    id: "sample-7",
    title: "Nightshift",
    city: "San Francisco",
    venueName: "Public Works",
    startsAt: "2026-04-10T06:00:00.000Z",
    genreTags: ["Techno", "Industrial"],
    sourcePrimary: "manual"
  },
  {
    id: "sample-8",
    title: "The Glass House",
    city: "Pomona",
    venueName: "The Glass House",
    startsAt: "2026-04-18T04:00:00.000Z",
    genreTags: ["Melodic Techno", "House"],
    sourcePrimary: "manual"
  }
];

export type EventAttendeePreview = {
  profileId: string;
  displayName: string;
  city: string | null;
  vibeTags: string[];
  rsvpStatus: RSVPStatus;
};

export type EventCandidatePreview = {
  profileId: string;
  displayName: string;
  city: string | null;
  vibeTags: string[];
  musicGenres: string[];
  overlapReason: string;
  discoveryLabel?: "Also going to this event" | "Into similar shows";
  softCandidate?: boolean;
  height?: string | null;
  education?: string | null;
  distanceKm?: number | null;
  connectionStatus?: "none" | "pending_outgoing" | "pending_incoming" | "matched";
};

export type EventAudienceMetrics = {
  goingCount: number;
  lookingForCrewCount: number;
};

const localDemoRsvpsByProfile: Record<string, Record<string, RSVPStatus>> = {};
const localDemoCrewVisibilityByProfile: Record<string, Record<string, boolean>> = {};

export async function listUpcomingEvents(limit = 25): Promise<EventRecord[]> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    const tmEvents = await listTicketmasterEvents(limit);
    return tmEvents.length > 0 ? tmEvents : demoEventsFallback.slice(0, limit);
  }

  const eventsTable = supabase.from("events") as any;
  const { data, error } = await eventsTable
    .select("id,title,venue_name,city,starts_at,genre_tags,source_primary")
    .gte("starts_at", new Date().toISOString())
    .order("starts_at", { ascending: true })
    .limit(limit);

  if (error || !Array.isArray(data)) {
    return demoEventsFallback.slice(0, limit);
  }

  const rows = data.map(mapEventRow);
  if (rows.length > 0) {
    return rows;
  }

  return demoEventsFallback.slice(0, limit);
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
    return { ok: false as const, error: error.message };
  }

  return { ok: true as const };
}

export async function upsertEventRsvp(profileId: string, eventId: string, status: RSVPStatus) {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return { ok: false as const, error: "Supabase is not configured." };
  }
  if (!isUuidLike(eventId)) {
    // Demo/local seeded events can use non-UUID IDs (e.g. "sample-1").
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
    return { ok: false as const, error: error.message };
  }
  if (status !== "going") {
    await rsvpTable.update({ looking_for_crew: false }).eq("profile_id", profileId).eq("event_id", eventId);
  }

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

  return data
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

  const mapRows = (rows: any[]) =>
    rows
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
          vibeTags,
          musicGenres,
          overlapReason: buildOverlapReason(vibeTags, musicGenres),
          height: (row.height as string | null) ?? null,
          education: (row.education as string | null) ?? null,
          distanceKm: typeof row.distance_km === "number" ? row.distance_km : null,
          connectionStatus: (row.connection_status as EventCandidatePreview["connectionStatus"]) ?? "none"
        } satisfies EventCandidatePreview;
      })
      .filter(Boolean) as EventCandidatePreview[];

  const { data: rpcData, error: rpcError } = await (supabase.rpc as any)("list_event_crew_candidates", {
    p_event_id: eventId,
    p_limit: limit * 2
  });
  if (Array.isArray(rpcData) && !rpcError) {
    return mapRows(rpcData).slice(0, limit);
  }

  const rsvpTable = supabase.from("event_rsvps") as any;
  const { data, error } = await rsvpTable
    .select("profile_id, looking_for_crew, profiles:profile_id ( id, display_name, city, vibe_tags, music_genres, height, education )")
    .eq("event_id", eventId)
    .eq("status", "going")
    .neq("profile_id", viewerProfileId)
    .limit(limit * 2);

  if (error || !Array.isArray(data)) {
    return [];
  }

  return data
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
        vibeTags,
        musicGenres,
        overlapReason: buildOverlapReason(vibeTags, musicGenres),
        height: (profile.height as string | null) ?? null,
        education: (profile.education as string | null) ?? null,
        distanceKm: null,
        connectionStatus: "none"
      } satisfies EventCandidatePreview;
    })
    .filter(Boolean)
    .slice(0, limit) as EventCandidatePreview[];
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
      vibeTags,
      musicGenres,
      overlapReason: label,
      discoveryLabel: label,
      softCandidate: true,
      height: (profile.height as string | null) ?? null,
      education: (profile.education as string | null) ?? null,
      distanceKm: null
    });
  };

  const rsvpTable = supabase.from("event_rsvps") as any;
  const eventsTable = supabase.from("events") as any;

  if (isUuidLike(event.id)) {
    const { data: sameEventRows } = await rsvpTable
      .select("profile_id,profiles:profile_id(id,display_name,city,vibe_tags,music_genres,height,education)")
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
      .select("profile_id,profiles:profile_id(id,display_name,city,vibe_tags,music_genres,height,education)")
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
      .select("profile_id,profiles:profile_id(id,display_name,city,vibe_tags,music_genres,height,education)")
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

  return results.slice(0, limit);
}

export async function startEventCrewThreadSeed(profileId: string, eventId: string) {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return { ok: true as const };
  }
  if (!isUuidLike(eventId)) {
    return { ok: true as const };
  }

  const roomsTable = supabase.from("event_rooms") as any;
  const membersTable = supabase.from("event_room_members") as any;
  const { data: room, error: roomError } = await roomsTable
    .upsert(
      {
        event_id: eventId,
        created_by: profileId
      },
      { onConflict: "event_id" }
    )
    .select("id")
    .single();

  if (roomError || !room?.id) {
    return { ok: false as const, error: roomError?.message ?? "Failed to create crew room." };
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
    return { ok: false as const, error: error.message };
  }
  return { ok: true as const };
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
    return { ok: false as const, error: error.message };
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
    genreTags: row.genre_tags ?? [],
    sourcePrimary: row.source_primary
  };
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

async function listTicketmasterEvents(limit: number): Promise<EventRecord[]> {
  if (!hasTicketmasterEnv()) {
    return [];
  }

  try {
    const requestSize = Math.max(20, Math.min(limit * 4, 100));
    const radius = Number.isFinite(env.ticketmasterRadiusMiles) ? Math.max(50, Math.min(80, Math.round(env.ticketmasterRadiusMiles))) : 80;
    const baseParams = new URLSearchParams({
      apikey: env.ticketmasterApiKey,
      size: String(requestSize),
      sort: "date,asc",
      countryCode: env.ticketmasterCountryCode || "US",
      classificationName: "music",
      radius: String(radius),
      unit: "miles"
    });

    if (env.ticketmasterCity?.trim()) {
      baseParams.set("city", env.ticketmasterCity.trim());
    }
    const now = new Date();
    const thirtyDaysFromNow = new Date(now.getTime() + 1000 * 60 * 60 * 24 * 30);
    baseParams.set("startDateTime", now.toISOString().replace(/\.\d{3}Z$/, "Z"));
    baseParams.set("endDateTime", thirtyDaysFromNow.toISOString().replace(/\.\d{3}Z$/, "Z"));

    const strictKeyword =
      env.ticketmasterKeyword?.trim() ||
      "rave OR edm OR electronic OR dance OR house OR techno OR dubstep OR trance OR hardstyle OR drum and bass OR dnb";

    const strictParams = new URLSearchParams(baseParams);
    strictParams.set("keyword", strictKeyword);
    const strictEvents = await fetchTicketmasterEvents(strictParams);
    const strictMapped = strictEvents
      .map(mapTicketmasterEvent)
      .filter((event): event is EventRecord => Boolean(event))
      .filter((event) => isEdmOrRaveEvent(event))
      .sort((a, b) => scoreTicketmasterEvent(b) - scoreTicketmasterEvent(a));
    if (strictMapped.length > 0) {
      return strictMapped.slice(0, limit);
    }

    const broadEvents = await fetchTicketmasterEvents(baseParams);
    const broadMapped = broadEvents
      .map(mapTicketmasterEvent)
      .filter((event): event is EventRecord => Boolean(event))
      .filter((event) => isEdmOrRaveEvent(event))
      .sort((a, b) => scoreTicketmasterEvent(b) - scoreTicketmasterEvent(a));
    return broadMapped.slice(0, limit);
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
    sourcePrimary: "ticketmaster"
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

const EDM_RAVE_KEYWORDS = [
  "edm",
  "rave",
  "electronic",
  "dance",
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
  "bass"
];

function isEdmOrRaveEvent(event: EventRecord) {
  const haystack = `${event.title} ${(event.genreTags ?? []).join(" ")}`.toLowerCase();
  return EDM_RAVE_KEYWORDS.some((keyword) => haystack.includes(keyword));
}

function scoreTicketmasterEvent(event: EventRecord) {
  const haystack = `${event.title} ${(event.genreTags ?? []).join(" ")}`.toLowerCase();
  let score = 0;
  for (const keyword of EDM_RAVE_KEYWORDS) {
    if (haystack.includes(keyword)) score += 10;
  }
  if (haystack.includes("dance/electronic")) score += 12;
  if (haystack.includes("electronic")) score += 8;
  if (haystack.includes("dj")) score += 5;
  return score;
}
