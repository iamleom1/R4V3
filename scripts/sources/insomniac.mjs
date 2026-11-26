import { deriveGenreTags, normalizeIsoDate, providerIdFromUrl } from "../lib/source-shared.mjs";

const INDEX_URL = "https://www.insomniac.com/events/los-angeles-ca/";
const ALLOWED_CITIES = new Set([
  "los angeles", "hollywood", "west hollywood", "long beach", "pomona", "anaheim",
  "santa ana", "costa mesa", "san bernardino", "riverside", "ontario", "pasadena",
  "inglewood", "irvine", "san diego"
]);

export async function scrapeInsomniacEvents({ fetchText, now = Date.now() }) {
  const indexHtml = await fetchText(INDEX_URL);
  if (!indexHtml) return [];
  const urls = extractInsomniacEventUrls(indexHtml);
  const events = [];
  for (const url of urls) {
    const html = await fetchText(url);
    const event = mapInsomniacEvent(extractInsomniacEvent(html, url), now);
    if (event) events.push(event);
  }
  return events;
}

export function extractInsomniacEventUrls(html) {
  const urls = new Set();
  for (const match of String(html).matchAll(/href=["'](https?:\/\/www\.insomniac\.com\/events\/[^"'#?]+\/?)["']/gi)) {
    const pathname = new URL(match[1]).pathname;
    if (!/^\/events\/los-angeles-ca(?:\/|$)/i.test(pathname) && !/^\/events\/?$/i.test(pathname)) urls.add(match[1]);
  }
  return [...urls];
}

export function extractInsomniacEvent(html, url) {
  const match = String(html).match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/i);
  if (!match) return null;
  try {
    const data = JSON.parse(match[1]);
    return data?.["@type"] === "Event" ? { ...data, sourceUrl: url } : null;
  } catch {
    return null;
  }
}

export function mapInsomniacEvent(raw, now = Date.now()) {
  const startsAt = normalizeIsoDate(raw?.startDate);
  const city = String(raw?.location?.address?.addressLocality ?? "").replace(/,$/, "").trim();
  if (!raw?.name || !startsAt || new Date(startsAt).getTime() < now || !ALLOWED_CITIES.has(city.toLowerCase())) return null;
  const description = stripHtml(raw.description);
  const genreTags = deriveGenreTags(`${raw.name} ${description} insomniac electronic festival club`);
  const images = Array.isArray(raw.image) ? raw.image : [raw.image];
  return {
    provider: "insomniac",
    providerEventId: providerIdFromUrl(raw.sourceUrl),
    title: raw.name.trim(),
    venueName: raw.location?.name?.trim() || null,
    city,
    region: String(raw.location?.address?.addressRegion ?? "CA").trim(),
    country: String(raw.location?.address?.addressCountry ?? "US").trim(),
    startsAt,
    endsAt: normalizeIsoDate(raw.endDate),
    genreTags: genreTags.length ? genreTags : ["electronic"],
    description: description || null,
    flyerUrl: images.filter(Boolean).at(-1) ?? null,
    musicPreviewUrl: null,
    rawPayload: { ...raw, url: raw.sourceUrl }
  };
}

function stripHtml(value) {
  return String(value ?? "").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&#8217;|&rsquo;/g, "’").replace(/\s+/g, " ").trim();
}
