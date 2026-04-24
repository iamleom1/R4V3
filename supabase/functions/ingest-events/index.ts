import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type TicketmasterClassification = {
  segment?: { name?: string };
  genre?: { name?: string };
  subGenre?: { name?: string };
};

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
      state?: { stateCode?: string };
      country?: { countryCode?: string };
    }>;
    attractions?: Array<{ classifications?: TicketmasterClassification[] }>;
  };
  classifications?: TicketmasterClassification[];
};

type EventInsert = {
  title: string;
  venue_name: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
  starts_at: string;
  genre_tags: string[];
  source_primary: "ticketmaster";
  flyer_url: string | null;
};

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

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed." }, 405);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const ticketmasterApiKey = Deno.env.get("TICKETMASTER_API_KEY");
    const cronSecret = Deno.env.get("EVENT_INGEST_CRON_SECRET");

    if (!supabaseUrl || !serviceRoleKey || !ticketmasterApiKey) {
      return json({ error: "Server is not configured." }, 500);
    }

    const authHeader = req.headers.get("Authorization") ?? "";
    const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    const authorized =
      (Boolean(cronSecret) && bearer === cronSecret) ||
      bearer === serviceRoleKey;

    if (!authorized) {
      return json({ error: "Unauthorized." }, 401);
    }

    const body = await req.json().catch(() => ({}));
    const city = String(body?.city ?? Deno.env.get("TICKETMASTER_DEFAULT_CITY") ?? "Los Angeles").trim();
    const countryCode = String(body?.countryCode ?? Deno.env.get("TICKETMASTER_COUNTRY_CODE") ?? "US").trim().toUpperCase();
    const keyword = String(body?.keyword ?? Deno.env.get("TICKETMASTER_KEYWORD") ?? "").trim();
    const daysAheadInput = Number(body?.daysAhead ?? 60);
    const daysAhead = Math.max(1, Math.min(90, Number.isFinite(daysAheadInput) ? Math.round(daysAheadInput) : 60));
    const sizeInput = Number(body?.size ?? 120);
    const size = Math.max(20, Math.min(200, Number.isFinite(sizeInput) ? Math.round(sizeInput) : 80));

    const radiusEnv = Number(Deno.env.get("TICKETMASTER_RADIUS_MILES") ?? 80);
    const radiusInput = Number(body?.radiusMiles ?? radiusEnv);
    const radiusMiles = Math.max(5, Math.min(300, Number.isFinite(radiusInput) ? Math.round(radiusInput) : 80));

    const now = new Date();
    const windowEnd = new Date(now.getTime() + 1000 * 60 * 60 * 24 * daysAhead);
    const cities = resolveTicketmasterCities(city);
    const eventResponses = await Promise.all(
      cities.map((cityName) => {
        const params = new URLSearchParams({
          apikey: ticketmasterApiKey,
          size: String(size),
          sort: "date,asc",
          countryCode,
          classificationName: "music",
          radius: String(radiusMiles),
          unit: "miles",
          city: cityName,
          startDateTime: toTicketmasterIso(now),
          endDateTime: toTicketmasterIso(windowEnd)
        });

        if (keyword) {
          params.set("keyword", keyword);
        }

        return fetchTicketmasterEvents(params);
      })
    );

    const merged = dedupeById(eventResponses.flat())
      .map(mapTicketmasterEvent)
      .filter((event): event is { providerEventId: string; row: EventInsert; raw: TicketmasterEvent } => Boolean(event))
      .filter((event) => isSupportedDiscoveryCity(event.row.city))
      .filter((event) => isEdmDiscoveryEvent(event.row))
      .sort((a, b) => scoreEvent(b.row) - scoreEvent(a.row));

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    });

    if (merged.length === 0) {
      await recordJobRun(admin, "ingest-events", "success", {
        fetched: 0,
        inserted: 0,
        updated: 0,
        city,
        countryCode,
        daysAhead,
        radiusMiles,
        message: "No events matched filters."
      });
      return json({ ok: true, fetched: 0, inserted: 0, updated: 0, message: "No events matched filters." });
    }

    const providerIds = merged.map((event) => event.providerEventId);
    const { data: sourceRows, error: sourceError } = await (admin.from("event_sources") as any)
      .select("event_id,provider_event_id")
      .eq("provider", "ticketmaster")
      .in("provider_event_id", providerIds);

    if (sourceError) {
      return json({ error: sourceError.message }, 500);
    }

    const sourceByProviderId = new Map<string, string>();
    for (const row of sourceRows ?? []) {
      if (row?.provider_event_id && row?.event_id) {
        sourceByProviderId.set(row.provider_event_id, row.event_id);
      }
    }

    const updates: Array<{ id: string } & EventInsert> = [];
    const inserts: Array<EventInsert & { providerEventId: string; rawPayload: TicketmasterEvent }> = [];

    for (const item of merged) {
      const existingEventId = sourceByProviderId.get(item.providerEventId);
      if (existingEventId) {
        updates.push({ id: existingEventId, ...item.row });
      } else {
        inserts.push({ ...item.row, providerEventId: item.providerEventId, rawPayload: item.raw });
      }
    }

    let updated = 0;
    for (const row of updates) {
      const { error } = await (admin.from("events") as any)
        .update({
          title: row.title,
          venue_name: row.venue_name,
          city: row.city,
          region: row.region,
          country: row.country,
          starts_at: row.starts_at,
          genre_tags: row.genre_tags,
          source_primary: row.source_primary,
          flyer_url: row.flyer_url
        })
        .eq("id", row.id);

      if (!error) {
        updated += 1;
      }
    }

    let inserted = 0;
    if (inserts.length > 0) {
      const eventRows = inserts.map((row) => ({
        title: row.title,
        venue_name: row.venue_name,
        city: row.city,
        region: row.region,
        country: row.country,
        starts_at: row.starts_at,
        genre_tags: row.genre_tags,
        source_primary: row.source_primary,
        flyer_url: row.flyer_url
      }));

      const { data: insertedEvents, error: insertEventsError } = await (admin.from("events") as any)
        .insert(eventRows)
        .select("id");

      if (insertEventsError) {
        return json({ error: insertEventsError.message }, 500);
      }

      const sourceInserts = (insertedEvents ?? []).map((eventRow: any, idx: number) => ({
        event_id: eventRow.id,
        provider: "ticketmaster",
        provider_event_id: inserts[idx].providerEventId,
        raw_payload: inserts[idx].rawPayload
      }));

      const { error: sourceInsertError } = await (admin.from("event_sources") as any)
        .upsert(sourceInserts, { onConflict: "provider,provider_event_id" });

      if (sourceInsertError) {
        return json({ error: sourceInsertError.message }, 500);
      }

      inserted = sourceInserts.length;
    }

    const payload = {
      ok: true,
      fetched: merged.length,
      inserted,
      updated,
      city,
      countryCode,
      daysAhead,
      radiusMiles
    };
    await recordJobRun(admin, "ingest-events", "success", payload);
    return json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected server error.";
    try {
      const supabaseUrl = Deno.env.get("SUPABASE_URL");
      const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      if (supabaseUrl && serviceRoleKey) {
        const admin = createClient(supabaseUrl, serviceRoleKey, {
          auth: { persistSession: false, autoRefreshToken: false }
        });
        await recordJobRun(admin, "ingest-events", "failure", { error: message });
      }
    } catch {
      // Do not mask the main error response.
    }
    return json({ error: message }, 500);
  }
});

async function recordJobRun(
  admin: ReturnType<typeof createClient>,
  jobName: string,
  status: "success" | "failure",
  details: Record<string, unknown>
) {
  await (admin.rpc as any)("record_job_run", {
    p_job_name: jobName,
    p_status: status,
    p_details: details
  });
}

function toTicketmasterIso(value: Date) {
  return value.toISOString().replace(/\.\d{3}Z$/, "Z");
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

function dedupeById(events: TicketmasterEvent[]) {
  const byId = new Map<string, TicketmasterEvent>();
  for (const event of events) {
    const id = event.id?.trim();
    if (!id || byId.has(id)) {
      continue;
    }
    byId.set(id, event);
  }
  return Array.from(byId.values());
}

function resolveTicketmasterCities(cityConfig: string) {
  const configured = cityConfig
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const ordered = configured.length > 0 ? [...configured, ...DEFAULT_SOCAL_TICKETMASTER_CITIES] : DEFAULT_SOCAL_TICKETMASTER_CITIES;
  return Array.from(new Set(ordered));
}

function mapTicketmasterEvent(event: TicketmasterEvent): { providerEventId: string; row: EventInsert; raw: TicketmasterEvent } | null {
  const providerEventId = event.id?.trim();
  const title = event.name?.trim();
  const startsAt = event.dates?.start?.dateTime?.trim() || localStartToIso(event.dates?.start?.localDate, event.dates?.start?.localTime);

  if (!providerEventId || !title || !startsAt) {
    return null;
  }

  const venue = event._embedded?.venues?.[0];
  const genreTags = deriveGenres(event);

  return {
    providerEventId,
    row: {
      title,
      venue_name: venue?.name?.trim() || null,
      city: venue?.city?.name?.trim() || null,
      region: venue?.state?.stateCode?.trim() || null,
      country: venue?.country?.countryCode?.trim() || null,
      starts_at: startsAt,
      genre_tags: genreTags,
      source_primary: "ticketmaster",
      flyer_url: extractTicketmasterFlyerUrl(event)
    },
    raw: event
  };
}

function localStartToIso(localDate?: string, localTime?: string) {
  if (!localDate) {
    return null;
  }
  // Ticketmaster localDate/localTime has no timezone. Persist as UTC fallback.
  const value = localTime ? `${localDate}T${localTime}` : `${localDate}T20:00:00`;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function deriveGenres(event: TicketmasterEvent) {
  const tags = new Set<string>();
  const add = (value?: string) => {
    const tag = value?.trim();
    if (tag && tag.toLowerCase() !== "music") {
      tags.add(tag);
    }
  };

  for (const classification of event.classifications ?? []) {
    add(classification.genre?.name);
    add(classification.subGenre?.name);
    add(classification.segment?.name);
  }

  for (const attraction of event._embedded?.attractions ?? []) {
    for (const classification of attraction.classifications ?? []) {
      add(classification.genre?.name);
      add(classification.subGenre?.name);
      add(classification.segment?.name);
    }
  }

  return Array.from(tags).slice(0, 8);
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

const TICKETMASTER_ALLOWED_GENRE_KEYWORDS = [
  "afters",
  "afterhours",
  "house",
  "tech house",
  "progressive house",
  "afro house",
  "deep house",
  "minimal house",
  "techno",
  "melodic techno",
  "hard techno",
  "dubstep",
  "drum and bass",
  "dnb",
  "trance",
  "hardstyle",
  "bass",
  "future bass",
  "uk garage",
  "garage",
  "breakbeat"
];

const TICKETMASTER_ALLOWED_TITLE_KEYWORDS = [
  "afters",
  "afterhours",
  "all night long",
  "open to close",
  "b2b",
  "warehouse rave",
  "rave"
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
  "children",
  "tribute"
];

function isEdmOrRaveEvent(event: EventInsert) {
  const text = `${event.title} ${event.venue_name ?? ""} ${event.genre_tags.join(" ")}`.toLowerCase();
  const genreMatch = TICKETMASTER_ALLOWED_GENRE_KEYWORDS.some((keyword) => text.includes(keyword));
  const titleMatch = TICKETMASTER_ALLOWED_TITLE_KEYWORDS.some((keyword) => text.includes(keyword));
  return genreMatch || titleMatch;
}

function scoreEvent(event: EventInsert) {
  const text = `${event.title} ${event.genre_tags.join(" ")}`.toLowerCase();
  let score = 0;
  for (const keyword of TICKETMASTER_ALLOWED_GENRE_KEYWORDS) {
    if (text.includes(keyword)) score += 10;
  }
  for (const keyword of TICKETMASTER_ALLOWED_TITLE_KEYWORDS) {
    if (text.includes(keyword)) score += 8;
  }
  if (event.genre_tags.length > 0) score += 1;
  return score;
}

function isEdmDiscoveryEvent(event: EventInsert) {
  const text = `${event.title} ${event.venue_name ?? ""} ${event.genre_tags.join(" ")}`.toLowerCase();
  if (!isEdmOrRaveEvent(event)) {
    return false;
  }
  return !NON_EDM_EXCLUSION_KEYWORDS.some((keyword) => text.includes(keyword));
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

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json"
    }
  });
}
