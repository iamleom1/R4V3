import { deriveGenreTags, normalizeIsoDate, providerIdFromUrl } from "../lib/source-shared.mjs";

const INDEX_URL = "https://www.insomniac.com/events/los-angeles-ca/";
const EVENT_SITEMAP_URL = "https://www.insomniac.com/wp-sitemap-posts-event-1.xml";
// These listings are part of Insomniac's Los Angeles results but deliberately link to
// festival-owned sites, so they never appear in Insomniac's WordPress event sitemap.
const EXTERNAL_LA_LISTINGS = [
  {
    name: "Time Warp Los Angeles 2026",
    startDate: "2026-11-27T00:00:00-08:00",
    endDate: "2026-11-29T00:00:00-08:00",
    sourceUrl: "https://time-warp.de/",
    city: "Los Angeles",
    genreTags: ["techno", "electronic"]
  },
  {
    name: "Skyline 2027",
    startDate: "2027-02-27T00:00:00-08:00",
    endDate: "2027-03-01T00:00:00-08:00",
    sourceUrl: "https://skylinefest.com/",
    city: "Los Angeles",
    genreTags: ["house", "techno", "electronic"],
    image: "https://d3vhc53cl8e8km.cloudfront.net/hello-staging/wp-content/uploads/sites/103/2026/10/13093405/skla_2027_mk_an_fest_site_seo_1200x630_r02.jpg"
  },
  {
    name: "A State of Trance Los Angeles 2027",
    startDate: "2027-06-11T00:00:00-07:00",
    endDate: "2027-06-13T00:00:00-07:00",
    sourceUrl: "https://festival.astateoftrance.com/los-angeles/",
    city: "Los Angeles",
    genreTags: ["trance", "electronic"]
  }
];
const ALLOWED_CITIES = new Set([
  "los angeles", "hollywood", "west hollywood", "long beach", "pomona", "anaheim",
  "santa ana", "costa mesa", "san bernardino", "riverside", "ontario", "pasadena",
  "inglewood", "irvine"
]);

export async function scrapeInsomniacEvents({ fetchText, now = Date.now() }) {
  const [indexHtml, sitemapXml] = await Promise.all([
    fetchText(INDEX_URL),
    fetchText(EVENT_SITEMAP_URL)
  ]);
  const urls = new Set([
    ...extractInsomniacEventUrls(indexHtml),
    ...extractInsomniacSitemapEventUrls(sitemapXml)
  ]);
  const events = [];
  for (const url of urls) {
    const html = await fetchText(url);
    const event = mapInsomniacEvent(extractInsomniacEvent(html, url), now);
    if (event) events.push(event);
  }
  for (const listing of EXTERNAL_LA_LISTINGS) {
    const event = mapExternalInsomniacListing(listing, now);
    if (event) events.push(event);
  }
  return events;
}

export function mapExternalInsomniacListing(raw, now = Date.now()) {
  const startsAt = normalizeIsoDate(raw?.startDate);
  if (!raw?.name || !raw?.sourceUrl || !startsAt || new Date(startsAt).getTime() < now) return null;
  return {
    provider: "insomniac",
    providerEventId: providerIdFromUrl(raw.sourceUrl),
    title: raw.name.trim(),
    venueName: null,
    city: raw.city,
    region: "CA",
    country: "US",
    startsAt,
    endsAt: normalizeIsoDate(raw.endDate),
    genreTags: raw.genreTags,
    description: null,
    flyerUrl: raw.image ?? null,
    musicPreviewUrl: null,
    rawPayload: { ...raw, url: raw.sourceUrl, listedBy: "insomniac" }
  };
}

export function extractInsomniacEventUrls(html) {
  const urls = new Set();
  for (const match of String(html).matchAll(/href=["'](https?:\/\/www\.insomniac\.com\/events\/[^"'#?]+\/?)["']/gi)) {
    const pathname = new URL(match[1]).pathname;
    if (!/^\/events\/los-angeles-ca(?:\/|$)/i.test(pathname) && !/^\/events\/?$/i.test(pathname)) urls.add(match[1]);
  }
  return [...urls];
}

export function extractInsomniacSitemapEventUrls(xml) {
  const urls = new Set();
  for (const match of String(xml ?? "").matchAll(/<loc>(https?:\/\/www\.insomniac\.com\/events\/[^<]+)<\/loc>/gi)) {
    const url = match[1].replace(/&amp;/g, "&");
    if (/-los-angeles-ca\/$/i.test(new URL(url).pathname)) urls.add(url);
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
