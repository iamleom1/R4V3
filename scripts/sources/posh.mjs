import {
  deriveGenreTags,
  extractCityFromAddress,
  isLikelyEdmEvent,
  normalizeIsoDate,
  providerIdFromUrl,
  stringOrNull
} from "../lib/source-shared.mjs";

export async function scrapePoshPromoters({ promoters, fetchJson, now = Date.now() }) {
  const events = [];
  const results = [];
  for (const promoter of promoters) {
    try {
      const slug = promoter.organizer_slug;
      if (!/^[a-z0-9-]{1,100}$/.test(slug ?? "")) throw new Error("Invalid POSH organizer slug");
      console.log(`[posh] loading promoter ${slug}`);
      const payload = await fetchJson(`https://posh.vip/api/web/v2/util/group_url/${slug}`);
      if (payload?.group?.url !== slug || !stringOrNull(payload?.group?._id) || !Array.isArray(payload?.events)) {
        throw new Error("Invalid POSH organizer response or organizer identity mismatch");
      }
      const mapped = [];
      for (const raw of payload.events) {
        // Match public visibility; never publish private or password-protected events.
        if (raw.displayOnThirdPartySites !== true || raw.passwordProtected || raw.status !== "live") continue;
        const startsAt = normalizeIsoDate(raw.startUtc);
        const endsAt = normalizeIsoDate(raw.endUtc);
        if (!startsAt || !endsAt || !stringOrNull(raw.id)) throw new Error("Public organizer event missing ID or valid dates");
        if (Date.parse(endsAt) <= now) continue;
        const event = mapPoshMarketplaceEvent({ ...raw, _id: raw.id, groupName: payload.group.name }, {
          city: promoter.default_city, region: promoter.default_region, country: promoter.default_country
        }, { trustedPromoter: true });
        if (!event) throw new Error("Public organizer event could not be normalized");
        event.rawPayload.promoterSourceId = promoter.id;
        event.rawPayload.organizerUrl = `https://posh.vip/g/${slug}`;
        mapped.push(event);
      }
      events.push(...mapped);
      results.push({ sourceId: promoter.id, slug, status: "success", eventCount: mapped.length });
    } catch (error) {
      results.push({ sourceId: promoter.id, slug: promoter.organizer_slug, status: "failure", error: error.message });
    }
  }
  return { events, results };
}

export async function scrapePoshRegions({ regions, whens, limitPerRegion, fetchJson }) {
  const events = [];

  for (const region of regions) {
    console.log(`[posh] loading ${region.name}`);
    const marketplaceEvents = await fetchPoshMarketplaceEvents(region, { whens, limitPerRegion, fetchJson });

    for (const rawEvent of marketplaceEvents) {
      const normalized = mapPoshMarketplaceEvent(rawEvent, region);
      if (normalized) {
        events.push(normalized);
      }
    }
  }

  return events;
}

export async function fetchPoshMarketplaceEvents(region, { whens, limitPerRegion, fetchJson }) {
  const deduped = new Map();

  for (const when of whens) {
    const input = {
      sort: "Trending",
      when,
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
      limit: limitPerRegion,
      clientTimezone: "America/Los_Angeles"
    };
    const url = `https://posh.vip/api/web/v2/trpc/events.fetchMarketplaceEvents?input=${encodeURIComponent(JSON.stringify(input))}`;
    const payload = await fetchJson(url);
    const events = payload?.result?.data?.events;
    if (!Array.isArray(events)) {
      continue;
    }

    for (const event of events) {
      const providerEventId = stringOrNull(event?._id) ?? providerIdFromUrl(event?.url ?? "");
      if (providerEventId && !deduped.has(providerEventId)) {
        deduped.set(providerEventId, event);
      }
    }
  }

  return Array.from(deduped.values());
}

export function mapPoshMarketplaceEvent(rawEvent, region, { trustedPromoter = false } = {}) {
  const title = stringOrNull(rawEvent?.name);
  const startsAt = normalizeIsoDate(rawEvent?.startUtc);
  const providerEventId = stringOrNull(rawEvent?._id) ?? providerIdFromUrl(rawEvent?.url ?? "");

  if (!title || !startsAt || !providerEventId) {
    return null;
  }

  const venueName = stringOrNull(rawEvent?.venue?.name);
  const venueAddress = stringOrNull(rawEvent?.venue?.address);
  const city = (venueAddress && /\b(?:tba|tbd|revealed|announced|secret)\b/i.test(venueAddress)
    ? null : extractCityFromAddress(venueAddress)) ?? region.city;
  const url = rawEvent?.url ? `https://posh.vip/e/${String(rawEvent.url).replace(/^\/+/, "")}` : null;
  const text = [title, rawEvent?.description, rawEvent?.shortDescription, venueName, venueAddress, rawEvent?.groupName].filter(Boolean).join(" ");

  if (!trustedPromoter && !isLikelyEdmEvent(text)) {
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
    description: stringOrNull(rawEvent?.description) ?? stringOrNull(rawEvent?.shortDescription),
    flyerUrl: stringOrNull(rawEvent?.flyer),
    rawPayload: { ...rawEvent, canonicalUrl: url }
  };
}
