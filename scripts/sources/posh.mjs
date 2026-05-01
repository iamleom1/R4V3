import {
  deriveGenreTags,
  extractCityFromAddress,
  isLikelyEdmEvent,
  normalizeIsoDate,
  providerIdFromUrl,
  stringOrNull
} from "../lib/source-shared.mjs";

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

export function mapPoshMarketplaceEvent(rawEvent, region) {
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
    description: stringOrNull(rawEvent?.shortDescription),
    flyerUrl: stringOrNull(rawEvent?.flyer),
    rawPayload: { ...rawEvent, canonicalUrl: url }
  };
}
