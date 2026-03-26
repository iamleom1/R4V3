import { createClient } from "@supabase/supabase-js";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const EDM_KEYWORDS = [
  "edm",
  "electronic",
  "techno",
  "house",
  "tech house",
  "deep house",
  "trance",
  "rave",
  "dubstep",
  "drum and bass",
  "dnb",
  "bass music",
  "hardstyle",
  "garage",
  "uk garage",
  "jungle",
  "club night",
  "dj set",
  "dance music",
  "dance party",
  "warehouse",
  "underground",
  "festival",
  "electro",
  "future bass",
  "trap",
  "breakbeat",
  "afters",
  "afters",
  "psytrance",
  "progressive"
];

const NON_EDM_EXCLUSION_KEYWORDS = [
  "comedy",
  "podcast",
  "worship",
  "opera",
  "ballet",
  "broadway",
  "musical",
  "play",
  "orchestra",
  "symphony",
  "tribute",
  "country",
  "folk"
];

const DICE_REGIONS = [
  {
    name: "Los Angeles",
    city: "Los Angeles",
    region: "CA",
    country: "US",
    browseUrl: "https://dice.fm/browse/losangeles-5982e13c613de866017c3e3a?lng=en-US"
  }
];

const POSH_REGIONS = [
  { name: "Los Angeles", city: "Los Angeles", region: "CA", country: "US", lat: 34.0522, lon: -118.2437 },
  { name: "Orange County", city: "Orange County", region: "CA", country: "US", lat: 33.7175, lon: -117.8311 },
  { name: "Inland Empire", city: "Inland Empire", region: "CA", country: "US", lat: 34.0555, lon: -117.1825 }
];

const HEADERS = {
  "user-agent": USER_AGENT,
  "accept-language": "en-US,en;q=0.9"
};

const REQUEST_TIMEOUT_MS = 30000;
const POSH_LIMIT_PER_REGION = clampInteger(process.env.POSH_LIMIT_PER_REGION, 24, 1, 100);
const ENABLED_SOURCES = parseCsv(process.env.EDM_SCRAPER_SOURCES || "dice,posh");
const DRY_RUN = (process.env.DRY_RUN || "false").toLowerCase() === "true";

async function main() {
  const admin = DRY_RUN
    ? null
    : createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
        auth: { persistSession: false, autoRefreshToken: false }
      });

  try {
    const scraped = [];

    if (ENABLED_SOURCES.has("dice")) {
      scraped.push(...(await scrapeDiceRegions()));
    }

    if (ENABLED_SOURCES.has("posh")) {
      scraped.push(...(await scrapePoshRegions()));
    }

    const deduped = dedupeScrapedEvents(scraped);
    if (DRY_RUN) {
      console.log(
        JSON.stringify(
          {
            ok: true,
            dryRun: true,
            fetched: deduped.length,
            bySource: summarizeBySource(deduped)
          },
          null,
          2
        )
      );
      return;
    }

    const result = await persistEvents(admin, deduped);
    const details = {
      fetched: deduped.length,
      inserted: result.inserted,
      updated: result.updated,
      by_source: summarizeBySource(deduped),
      sources: Array.from(ENABLED_SOURCES)
    };

    await tryRecordJobRun(admin, "success", details);

    console.log(
      JSON.stringify(
        {
          ok: true,
          ...details
        },
        null,
        2
      )
    );
  } catch (error) {
    if (!DRY_RUN && admin) {
      await tryRecordJobRun(admin, "failure", {
        error: toErrorMessage(error),
        sources: Array.from(ENABLED_SOURCES)
      });
    }
    throw error;
  }
}

async function scrapeDiceRegions() {
  const events = [];

  for (const region of DICE_REGIONS) {
    console.log(`[dice] loading ${region.name}`);
    const html = await fetchText(region.browseUrl);
    if (!html) {
      continue;
    }

    const nextData = extractNextDataJson(html);
    const pageEvents = nextData?.props?.pageProps?.events;
    if (!Array.isArray(pageEvents)) {
      console.warn(`[dice] no event payload found for ${region.name}`);
      continue;
    }

    for (const rawEvent of pageEvents) {
      const normalized = mapDiceEvent(rawEvent, region);
      if (normalized) {
        events.push(normalized);
      }
    }
  }

  return events;
}

async function scrapePoshRegions() {
  const events = [];

  for (const region of POSH_REGIONS) {
    console.log(`[posh] loading ${region.name}`);
    const marketplaceEvents = await fetchPoshMarketplaceEvents(region);

    for (const rawEvent of marketplaceEvents) {
      const normalized = mapPoshMarketplaceEvent(rawEvent, region);
      if (normalized) {
        events.push(normalized);
      }
    }
  }

  return events;
}

function mapDiceEvent(rawEvent, region) {
  const providerEventId = stringOrNull(rawEvent?.id) ?? stringOrNull(rawEvent?.perm_name);
  const title = stringOrNull(rawEvent?.name);
  const startsAt = stringOrNull(rawEvent?.dates?.event_start_date);

  if (!providerEventId || !title || !startsAt) {
    return null;
  }

  const venue = rawEvent?.venues?.[0];
  const city = stringOrNull(venue?.city?.name) ?? region.city;
  const text = [
    title,
    rawEvent?.about?.description,
    rawEvent?.presented_by,
    venue?.name,
    rawEvent?.tags?.map?.((tag) => tag?.name).join(" ")
  ]
    .filter(Boolean)
    .join(" ");

  if (!isLikelyEdmEvent(text)) {
    return null;
  }

  return {
    provider: "dice",
    providerEventId,
    title,
    venueName: stringOrNull(venue?.name),
    city,
    region: region.region,
    country: region.country,
    startsAt,
    endsAt: stringOrNull(rawEvent?.dates?.event_end_date),
    genreTags: deriveGenreTags(text),
    flyerUrl:
      stringOrNull(rawEvent?.images?.portrait) ??
      stringOrNull(rawEvent?.images?.square) ??
      stringOrNull(rawEvent?.images?.landscape),
    rawPayload: rawEvent
  };
}

async function fetchPoshMarketplaceEvents(region) {
  const input = {
    sort: "Trending",
    when: "This Week",
    search: "",
    location: {
      type: "custom",
      lat: region.lat,
      long: region.lon,
      location: `${region.city}, ${region.region}`
    },
    secondaryFilters: [],
    where: `${region.city}, ${region.region}`,
    coordinates: [region.lon, region.lat],
    limit: POSH_LIMIT_PER_REGION,
    clientTimezone: "America/Los_Angeles"
  };
  const url = `https://posh.vip/api/web/v2/trpc/events.fetchMarketplaceEvents?input=${encodeURIComponent(JSON.stringify(input))}`;
  const payload = await fetchJson(url);
  const events = payload?.result?.data?.events;
  return Array.isArray(events) ? events : [];
}

function mapPoshMarketplaceEvent(rawEvent, region) {
  const title = stringOrNull(rawEvent?.name);
  const startsAt = normalizeIsoDate(rawEvent?.startUtc);
  const providerEventId = stringOrNull(rawEvent?._id) ?? providerIdFromUrl(rawEvent?.url ?? "");

  if (!title || !startsAt || !providerEventId) {
    return null;
  }

  const venueName = stringOrNull(rawEvent?.venue?.name);
  const venueAddress = stringOrNull(rawEvent?.venue?.address);
  const city = extractCityFromAddress(venueAddress) ?? region.city;
  const url = rawEvent?.url ? `https://posh.vip/e/${String(rawEvent.url).replace(/^\/+/, "")}` : null;
  const text = [title, rawEvent?.shortDescription, venueName, venueAddress, rawEvent?.groupName].filter(Boolean).join(" ");

  if (!isLikelyEdmEvent(text)) {
    return null;
  }

  return {
    provider: "posh",
    providerEventId,
    title,
    venueName,
    city,
    region: region.region,
    country: region.country,
    startsAt,
    endsAt: normalizeIsoDate(rawEvent?.endUtc),
    genreTags: deriveGenreTags(text),
    flyerUrl: stringOrNull(rawEvent?.flyer),
    rawPayload: { ...rawEvent, canonicalUrl: url }
  };
}

async function persistEvents(admin, events) {
  const validEvents = events.filter((event) => event.startsAt);
  if (validEvents.length === 0) {
    return { inserted: 0, updated: 0 };
  }

  const sourceRowsByProvider = new Map();

  for (const provider of ["dice", "posh"]) {
    const providerIds = validEvents.filter((event) => event.provider === provider).map((event) => event.providerEventId);
    if (providerIds.length === 0) {
      continue;
    }

    const { data, error } = await admin
      .from("event_sources")
      .select("event_id,provider_event_id")
      .eq("provider", provider)
      .in("provider_event_id", providerIds);

    if (error) {
      throw new Error(`Failed loading existing ${provider} source rows: ${error.message}`);
    }

    sourceRowsByProvider.set(provider, new Map((data ?? []).map((row) => [row.provider_event_id, row.event_id])));
  }

  const updates = [];
  const inserts = [];

  for (const event of validEvents) {
    const existingEventId = sourceRowsByProvider.get(event.provider)?.get(event.providerEventId);
    if (existingEventId) {
      updates.push({ id: existingEventId, ...event });
    } else {
      inserts.push(event);
    }
  }

  let updated = 0;
  for (const event of updates) {
    const { error } = await admin
      .from("events")
      .update({
        title: event.title,
        venue_name: event.venueName,
        city: event.city,
        region: event.region,
        country: event.country,
        starts_at: event.startsAt,
        ends_at: event.endsAt,
        genre_tags: event.genreTags,
        source_primary: event.provider,
        flyer_url: event.flyerUrl
      })
      .eq("id", event.id);

    if (error) {
      throw new Error(`Failed updating ${event.provider}:${event.providerEventId}: ${error.message}`);
    }

    const { error: sourceError } = await admin
      .from("event_sources")
      .update({
        raw_payload: event.rawPayload,
        fetched_at: new Date().toISOString()
      })
      .eq("provider", event.provider)
      .eq("provider_event_id", event.providerEventId);

    if (sourceError) {
      throw new Error(`Failed updating source payload for ${event.provider}:${event.providerEventId}: ${sourceError.message}`);
    }

    updated += 1;
  }

  let inserted = 0;
  if (inserts.length > 0) {
    const { data: insertedRows, error } = await admin
      .from("events")
      .insert(
        inserts.map((event) => ({
          title: event.title,
          venue_name: event.venueName,
          city: event.city,
          region: event.region,
          country: event.country,
          starts_at: event.startsAt,
          ends_at: event.endsAt,
          genre_tags: event.genreTags,
          source_primary: event.provider,
          flyer_url: event.flyerUrl
        }))
      )
      .select("id");

    if (error) {
      throw new Error(`Failed inserting events: ${error.message}`);
    }

    const sourceRows = (insertedRows ?? []).map((row, index) => ({
      event_id: row.id,
      provider: inserts[index].provider,
      provider_event_id: inserts[index].providerEventId,
      raw_payload: inserts[index].rawPayload
    }));

    const { error: sourceError } = await admin.from("event_sources").upsert(sourceRows, {
      onConflict: "provider,provider_event_id"
    });

    if (sourceError) {
      throw new Error(`Failed inserting event sources: ${sourceError.message}`);
    }

    inserted = sourceRows.length;
  }

  return { inserted, updated };
}

async function fetchText(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, { headers: HEADERS, signal: controller.signal });
    if (!response.ok) {
      console.warn(`request failed ${response.status} for ${url}`);
      return null;
    }
    return await response.text();
  } catch (error) {
    console.warn(`request failed for ${url}: ${toErrorMessage(error)}`);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchJson(url) {
  const text = await fetchText(url);
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function extractNextDataJson(html) {
  const match = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/i);
  if (!match) {
    return null;
  }

  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}

function dedupeScrapedEvents(events) {
  const unique = new Map();

  for (const event of events) {
    const key = `${event.provider}:${event.providerEventId}`;
    if (!unique.has(key)) {
      unique.set(key, event);
    }
  }

  return Array.from(unique.values());
}

function summarizeBySource(events) {
  const counts = {};
  for (const event of events) {
    counts[event.provider] = (counts[event.provider] ?? 0) + 1;
  }
  return counts;
}

function deriveGenreTags(text) {
  const haystack = String(text || "").toLowerCase();
  const tags = EDM_KEYWORDS.filter((keyword) => haystack.includes(keyword));
  return Array.from(new Set(tags)).slice(0, 8);
}

function isLikelyEdmEvent(text) {
  const haystack = String(text || "").toLowerCase();
  if (!EDM_KEYWORDS.some((keyword) => haystack.includes(keyword))) {
    return false;
  }
  return !NON_EDM_EXCLUSION_KEYWORDS.some((keyword) => haystack.includes(keyword));
}

function providerIdFromUrl(url) {
  try {
    const pathname = new URL(url).pathname.replace(/\/+$/, "");
    const lastSegment = pathname.split("/").filter(Boolean).at(-1);
    return lastSegment || url;
  } catch {
    return url;
  }
}

function normalizeIsoDate(value) {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function extractCityFromAddress(address) {
  if (!address) {
    return null;
  }

  const parts = address.split(",").map((part) => part.trim()).filter(Boolean);
  if (parts.length >= 3) {
    return parts[parts.length - 3] || null;
  }
  return parts.at(-1) ?? null;
}

function stringOrNull(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function parseCsv(value) {
  return new Set(
    String(value)
      .split(",")
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean)
  );
}

function clampInteger(value, fallback, min, max) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, parsed));
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function toErrorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

async function tryRecordJobRun(admin, status, details) {
  try {
    await admin.rpc("record_job_run", {
      p_job_name: "ingest-edm-events",
      p_status: status,
      p_details: details
    });
  } catch {
    // Job telemetry is optional for local/script-based ingestion.
  }
}

await main();
