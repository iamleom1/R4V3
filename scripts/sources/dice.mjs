import {
  deriveGenreTags,
  extractCityFromAddress,
  extractNextDataJson,
  isLikelyEdmEvent,
  stringOrNull
} from "../lib/source-shared.mjs";

const DICE_BASE_URL = "https://dice.fm";
const DICE_PRIMARY_FILTER_ALLOWLIST = new Set(["dj", "party"]);
const DICE_SECONDARY_FILTER_KEYWORDS = [
  "afrohouse",
  "bass",
  "dance",
  "deep house",
  "deephouse",
  "disco",
  "dnb",
  "drum",
  "dubstep",
  "edm",
  "electro",
  "garage",
  "house",
  "jungle",
  "progressive",
  "psytrance",
  "rave",
  "techno",
  "trance",
  "trap"
];

export async function scrapeDiceRegions({ regions, fetchText }) {
  const events = [];
  const sitemapEventUrls = await loadDiceSitemapEventUrls(fetchText, regions);

  for (const region of regions) {
    console.log(`[dice] loading ${region.name}`);
    if (region.mode === "sitemap") {
      const regionUrls = matchDiceSitemapUrlsForRegion(sitemapEventUrls, region);
      console.log(`[dice] ${region.name}: ${regionUrls.length} candidate pages`);

      for (const eventUrl of regionUrls) {
        const html = await fetchText(eventUrl);
        if (!html) {
          continue;
        }

        const rawEvent = extractDiceEventFromEventPage(html);
        const normalized = mapDiceEvent(rawEvent, region);
        if (normalized && regionMatchesDiceEvent(normalized, rawEvent, region)) {
          events.push(normalized);
        }
      }
      continue;
    }

    const basePage = await loadDiceBrowsePage(region.browseUrl, fetchText);
    if (!basePage) {
      continue;
    }

    if (!Array.isArray(basePage.pageEvents)) {
      console.warn(`[dice] no event payload found for ${region.name}`);
      continue;
    }

    for (const rawEvent of basePage.pageEvents) {
      const normalized = mapDiceEvent(rawEvent, region, { browseHints: [] });
      if (normalized) {
        events.push(normalized);
      }
    }

    const extraTargets = [
      ...selectDicePrimaryFilterTargets(basePage.pageProps),
      ...collectDiceSecondaryFilterTargets(basePage.pageProps)
    ];

    for (const target of extraTargets) {
      const page = await loadDiceBrowsePage(target.url, fetchText);
      if (!page) {
        continue;
      }

      for (const rawEvent of page.pageEvents) {
        const normalized = mapDiceEvent(rawEvent, region, {
          browseHints: target.hints,
          sourceUrl: target.url
        });
        if (normalized) {
          events.push(normalized);
        }
      }

      for (const secondaryTarget of collectDiceSecondaryFilterTargets(page.pageProps)) {
        const secondaryPage = await loadDiceBrowsePage(secondaryTarget.url, fetchText);
        if (!secondaryPage) {
          continue;
        }

        for (const rawEvent of secondaryPage.pageEvents) {
          const normalized = mapDiceEvent(rawEvent, region, {
            browseHints: secondaryTarget.hints,
            sourceUrl: secondaryTarget.url
          });
          if (normalized) {
            events.push(normalized);
          }
        }
      }
    }
  }

  return events;
}

export async function scrapeDicePromoters({ promoters, fetchText, now = Date.now() }) {
  const events = [];
  const results = [];

  for (const promoter of promoters) {
    try {
      const slug = promoter.organizer_slug;
      if (!/^[a-z0-9-]{1,100}$/.test(slug ?? "")) {
        throw new Error("Invalid DICE promoter slug");
      }

      console.log(`[dice] loading promoter ${slug}`);
      const sourceUrl = `${DICE_BASE_URL}/promoters/${slug}?lng=en-US`;
      const html = await fetchText(sourceUrl);
      const profile = extractDicePromoterProfile(html);

      if (profile?.promoter?.slug !== slug || !stringOrNull(profile?.promoter?.id) || !Array.isArray(profile?.sections)) {
        throw new Error("Invalid DICE promoter response or promoter identity mismatch");
      }

      const rawEvents = collectDicePromoterEvents(profile);
      const mapped = [];
      for (const rawEvent of rawEvents) {
        const startsAt = stringOrNull(rawEvent?.dates?.event_start_date);
        const endsAt = stringOrNull(rawEvent?.dates?.event_end_date);
        if (!stringOrNull(rawEvent?.id) || !startsAt || !endsAt) {
          throw new Error("DICE promoter event missing ID or valid dates");
        }
        if (!Number.isFinite(Date.parse(startsAt)) || !Number.isFinite(Date.parse(endsAt))) {
          throw new Error("DICE promoter event missing ID or valid dates");
        }
        if (Date.parse(endsAt) <= now || String(rawEvent?.status ?? "").toLowerCase() === "cancelled") {
          continue;
        }

        const eventUrl = `${DICE_BASE_URL}/event/${rawEvent.id}`;
        const event = mapDiceEvent(
          { ...rawEvent, presented_by: profile.promoter.name },
          { city: promoter.default_city, region: promoter.default_region, country: promoter.default_country },
          { sourceUrl: eventUrl, trustedPromoter: true }
        );
        if (!event) {
          throw new Error("DICE promoter event could not be normalized");
        }
        event.rawPayload.promoterSourceId = promoter.id;
        event.rawPayload.organizerUrl = `${DICE_BASE_URL}/promoters/${slug}`;
        mapped.push(event);
      }

      events.push(...mapped);
      results.push({ sourceId: promoter.id, slug, provider: "dice", status: "success", eventCount: mapped.length });
    } catch (error) {
      results.push({ sourceId: promoter.id, slug: promoter.organizer_slug, provider: "dice", status: "failure", error: error.message });
    }
  }

  return { events, results };
}

export function extractDicePromoterProfile(html) {
  if (!html) return null;
  return extractNextDataJson(html)?.props?.pageProps?.profile ?? null;
}

function collectDicePromoterEvents(profile) {
  const unique = new Map();
  for (const section of profile.sections ?? []) {
    const candidates = Array.isArray(section?.events)
      ? section.events
      : Array.isArray(section?.items)
        ? section.items.map((item) => item?.event).filter(Boolean)
        : [];
    for (const event of candidates) {
      const id = stringOrNull(event?.id);
      if (id && !unique.has(id)) unique.set(id, event);
    }
  }
  return Array.from(unique.values());
}

export function mapDiceEvent(rawEvent, region, context = {}) {
  if (!rawEvent || typeof rawEvent !== "object") {
    return null;
  }

  const providerEventId = stringOrNull(rawEvent?.id) ?? stringOrNull(rawEvent?.perm_name);
  const title = stringOrNull(rawEvent?.name);
  const startsAt = stringOrNull(rawEvent?.dates?.event_start_date);

  if (!providerEventId || !title || !startsAt) {
    return null;
  }

  const venue = rawEvent?.venues?.[0];
  const venueAddress = stringOrNull(venue?.address);
  const city = stringOrNull(venue?.city?.name) ?? extractCityFromAddress(venueAddress) ?? region.city;
  const browseHints = Array.isArray(context?.browseHints) ? context.browseHints.filter(Boolean) : [];
  const text = [
    title,
    rawEvent?.about?.description,
    rawEvent?.presented_by,
    venue?.name,
    rawEvent?.tags?.map?.((tag) => tag?.name).join(" "),
    browseHints.join(" ")
  ]
    .filter(Boolean)
    .join(" ");

  if (!context?.trustedPromoter && !isLikelyEdmEvent(text)) {
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
    description: stringOrNull(rawEvent?.about?.description),
    musicPreviewUrl: selectDiceMusicPreviewUrl(rawEvent),
    flyerUrl:
      stringOrNull(rawEvent?.images?.portrait) ??
      stringOrNull(rawEvent?.images?.square) ??
      stringOrNull(rawEvent?.images?.landscape),
    rawPayload: context?.sourceUrl
      ? {
          ...rawEvent,
          __diceBrowseContext: {
            sourceUrl: context.sourceUrl,
            browseHints
          }
        }
      : rawEvent
  };
}

function selectDiceMusicPreviewUrl(rawEvent) {
  const previews = Array.isArray(rawEvent?.previews) ? rawEvent.previews : [];
  const playablePreviews = previews.filter((preview) => stringOrNull(preview?.preview_url));

  const spotifyPreview = playablePreviews.find((preview) => String(preview?.type ?? "").toLowerCase() === "spotify");
  if (spotifyPreview) {
    return stringOrNull(spotifyPreview.preview_url);
  }

  return stringOrNull(playablePreviews[0]?.preview_url);
}

function loadDiceBrowsePage(url, fetchText) {
  return fetchText(url).then((html) => {
    if (!html) {
      return null;
    }

    const nextData = extractNextDataJson(html);
    const pageProps = nextData?.props?.pageProps ?? null;
    const pageEvents = Array.isArray(pageProps?.events) ? pageProps.events : [];
    return {
      pageProps,
      pageEvents
    };
  });
}

function selectDicePrimaryFilterTargets(pageProps) {
  if (!Array.isArray(pageProps?.primaryFilters)) {
    return [];
  }

  return pageProps.primaryFilters
    .filter((filter) => DICE_PRIMARY_FILTER_ALLOWLIST.has(String(filter?.name ?? "").trim().toLowerCase()))
    .map((filter) => ({
      url: absolutizeDiceBrowseUrl(filter.activateLink),
      hints: [stringOrNull(filter?.name)].filter(Boolean)
    }))
    .filter((target) => target.url);
}

function collectDiceSecondaryFilterTargets(pageProps) {
  if (!Array.isArray(pageProps?.secondaryFilters)) {
    return [];
  }

  return pageProps.secondaryFilters
    .filter((filter) => isDiceEdmSecondaryFilter(filter?.name))
    .map((filter) => ({
      url: absolutizeDiceBrowseUrl(filter.activateLink),
      hints: [stringOrNull(pageProps?.primaryFilterSlug)?.replace(/^music:/, ""), stringOrNull(filter?.name)].filter(Boolean)
    }))
    .filter((target) => target.url);
}

function isDiceEdmSecondaryFilter(name) {
  const normalized = String(name ?? "").trim().toLowerCase();
  return normalized && DICE_SECONDARY_FILTER_KEYWORDS.some((keyword) => normalized.includes(keyword));
}

function absolutizeDiceBrowseUrl(value) {
  const normalized = stringOrNull(value);
  if (!normalized) {
    return null;
  }

  const url = normalized.startsWith("http") ? new URL(normalized) : new URL(normalized, DICE_BASE_URL);
  if (!url.searchParams.has("lng")) {
    url.searchParams.set("lng", "en-US");
  }
  return url.toString();
}

async function loadDiceSitemapEventUrls(fetchText, regions) {
  const sitemapRegions = regions.filter((region) => region.mode === "sitemap" && region.citySlugTerms?.length > 0);
  if (sitemapRegions.length === 0) {
    return [];
  }

  const searchTerms = Array.from(
    new Set(
      sitemapRegions.flatMap((region) => region.citySlugTerms.map((term) => term.toLowerCase()))
    )
  );
  const sitemapUrls = [
    "https://dice.fm/sitemaps/sitemap1.xml",
    "https://dice.fm/sitemaps/sitemap2.xml",
    "https://dice.fm/sitemaps/sitemap3.xml"
  ];
  const matches = new Set();

  for (const sitemapUrl of sitemapUrls) {
    const xml = await fetchText(sitemapUrl);
    if (!xml) {
      continue;
    }

    for (const url of extractDiceEventUrlsFromSitemap(xml)) {
      const lowerUrl = url.toLowerCase();
      if (searchTerms.some((term) => lowerUrl.includes(term))) {
        matches.add(url);
      }
    }
  }

  return Array.from(matches);
}

function extractDiceEventUrlsFromSitemap(xml) {
  return [...xml.matchAll(/<loc>(https:\/\/dice\.fm\/event\/[^<]+)<\/loc>/gi)].map((match) => match[1]);
}

function matchDiceSitemapUrlsForRegion(urls, region) {
  const terms = region.citySlugTerms.map((term) => term.toLowerCase());
  return urls.filter((url) => {
    const lowerUrl = url.toLowerCase();
    return terms.some((term) => lowerUrl.includes(term));
  });
}

export function extractDiceEventFromEventPage(html) {
  const nextData = extractNextDataJson(html);
  const initialState = nextData?.props?.pageProps?.initialState;
  if (typeof initialState !== "string") {
    return null;
  }

  try {
    return JSON.parse(initialState)?.event?.event ?? null;
  } catch {
    return null;
  }
}

export function regionMatchesDiceEvent(normalizedEvent, rawEvent, region) {
  const allowedCities = new Set((region.cityNames ?? []).map((city) => city.toLowerCase()));
  if (allowedCities.size === 0) {
    return true;
  }

  const venue = rawEvent?.venues?.[0];
  const venueAddress = stringOrNull(venue?.address)?.toLowerCase() ?? "";
  const normalizedCity = stringOrNull(normalizedEvent?.city)?.toLowerCase() ?? "";

  if (normalizedCity && allowedCities.has(normalizedCity)) {
    return true;
  }

  return Array.from(allowedCities).some((city) => venueAddress.includes(city));
}
