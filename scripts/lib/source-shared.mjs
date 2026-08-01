const EDM_KEYWORDS = [
  "edm",
  "electronic",
  "techno",
  "hard techno",
  "hardstyle",
  "house",
  "tech house",
  "deep house",
  "afro house",
  "progressive house",
  "trance",
  "psytrance",
  "rave",
  "dubstep",
  "drum and bass",
  "dnb",
  "bass music",
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
  "afters party",
  "after party",
  "afterparty",
  "afterhours",
  "after hours",
  "progressive"
];

const EDM_GENRE_RULES = [
  { tag: "hard techno", patterns: ["hard techno", "hardtechno", "industrial techno", "peak time techno", "hardgroove", "schranz"] },
  { tag: "tech house", patterns: ["tech house"] },
  { tag: "deep house", patterns: ["deep house"] },
  { tag: "afro house", patterns: ["afro house"] },
  { tag: "progressive house", patterns: ["progressive house"] },
  { tag: "house", patterns: ["house"] },
  { tag: "techno", patterns: ["techno"] },
  { tag: "hardstyle", patterns: ["hardstyle"] },
  { tag: "trance", patterns: ["trance"] },
  { tag: "psytrance", patterns: ["psytrance"] },
  { tag: "dubstep", patterns: ["dubstep", "brostep", "riddim"] },
  { tag: "drum and bass", patterns: ["drum and bass", "drum & bass", "dnb"] },
  { tag: "bass", patterns: ["bass music", "future bass", "bass", "trap"] },
  { tag: "garage", patterns: ["uk garage", "garage"] },
  { tag: "jungle", patterns: ["jungle"] },
  { tag: "breakbeat", patterns: ["breakbeat"] },
  { tag: "electro", patterns: ["electro"] },
  { tag: "afters", patterns: ["afters", "afters party", "after party", "afterparty", "afterhours", "after hours"] },
  { tag: "rave", patterns: ["rave", "warehouse", "underground"] }
];

const EDM_PROMOTER_HINTS = [
  "framework",
  "stranger than",
  "insomniac",
  "factory 93",
  "brownies & lemonade",
  "space yacht",
  "sound",
  "academy",
  "nova",
  "exchange",
  "avalon",
  "lights down low"
];

const EDM_VENUE_HINTS = [
  "sound nightclub",
  "academy la",
  "exchange la",
  "avalon hollywood",
  "time nightclub",
  "nova sd",
  "gin ling way",
  "catch one",
  "los globos",
  "the spotlight",
  "reframe studios",
  "academy",
  "sound"
];

const EDM_TITLE_HINTS = [
  "open to close",
  "afters",
  "afterhours",
  "b2b",
  "all night long",
  "boiler room",
  "warehouse"
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

const DEFAULT_DICE_REGIONS = [
  {
    mode: "browse",
    name: "Los Angeles County",
    city: "Los Angeles",
    region: "CA",
    country: "US",
    browseUrl: "https://dice.fm/browse/losangeles-5982e13c613de866017c3e3a?lng=en-US"
  },
  {
    mode: "browse",
    name: "San Diego County",
    city: "San Diego",
    region: "CA",
    country: "US",
    browseUrl: "https://dice.fm/browse/san%20diego-5e3c28af136e51081e406ed5?lng=en-US"
  },
  {
    mode: "sitemap",
    name: "Orange County",
    city: "Orange County",
    region: "CA",
    country: "US",
    cityNames: ["Anaheim", "Santa Ana", "Costa Mesa", "Irvine", "Huntington Beach", "Newport Beach", "Orange", "Fullerton"],
    citySlugTerms: ["anaheim", "santa-ana", "costa-mesa", "irvine", "huntington-beach", "newport-beach", "orange", "fullerton"]
  },
  {
    mode: "sitemap",
    name: "Riverside County",
    city: "Riverside County",
    region: "CA",
    country: "US",
    cityNames: ["Riverside", "Temecula", "Murrieta", "Corona", "Palm Springs"],
    citySlugTerms: ["riverside", "temecula", "murrieta", "corona", "palm-springs"]
  },
  {
    mode: "sitemap",
    name: "Inland Empire",
    city: "Inland Empire",
    region: "CA",
    country: "US",
    cityNames: ["Pomona", "Ontario", "Rancho Cucamonga", "San Bernardino", "Redlands"],
    citySlugTerms: ["pomona", "ontario", "rancho-cucamonga", "san-bernardino", "redlands"]
  }
];

export function dedupeScrapedEvents(events) {
  const unique = new Map();

  for (const event of events) {
    const key = `${event.provider}:${event.providerEventId}`;
    if (!unique.has(key)) {
      unique.set(key, event);
    }
  }

  return Array.from(unique.values());
}

export function summarizeBySource(events) {
  const counts = {};
  for (const event of events) {
    counts[event.provider] = (counts[event.provider] ?? 0) + 1;
  }
  return counts;
}

export function deriveGenreTags(text) {
  const haystack = String(text || "").toLowerCase();
  const tags = EDM_GENRE_RULES
    .filter((rule) => rule.patterns.some((pattern) => haystack.includes(pattern)))
    .map((rule) => rule.tag);

  return Array.from(new Set(tags)).slice(0, 8);
}

export function isLikelyEdmEvent(text) {
  const haystack = String(text || "").toLowerCase();
  if (!haystack) {
    return false;
  }

  if (NON_EDM_EXCLUSION_KEYWORDS.some((keyword) => haystack.includes(keyword))) {
    return false;
  }

  let score = 0;
  score += countMatches(haystack, EDM_KEYWORDS) * 2;
  score += countMatches(haystack, EDM_PROMOTER_HINTS) * 2;
  score += countMatches(haystack, EDM_VENUE_HINTS) * 2;
  score += countMatches(haystack, EDM_TITLE_HINTS);

  return score >= 2;
}

export function providerIdFromUrl(url) {
  try {
    const pathname = new URL(url).pathname.replace(/\/+$/, "");
    const lastSegment = pathname.split("/").filter(Boolean).at(-1);
    return lastSegment || url;
  } catch {
    return url;
  }
}

export function normalizeIsoDate(value) {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

export function extractCityFromAddress(address) {
  const raw = stringOrNull(address);
  if (!raw) {
    return null;
  }

  const normalized = raw.replace(/\s+/g, " ").trim();
  const streetLineMatch = normalized.match(
    /(?:^|\s)\d+.*\b(?:st|street|ave|avenue|blvd|boulevard|rd|road|dr|drive|ln|lane|way|pl|place|ct|court|pkwy|parkway)\b\s+([A-Za-z][A-Za-z .'-]*?)\s+[A-Z]{2}(?:\s+\d{5}(?:-\d{4})?)?(?:,\s*[A-Z]{2})?$/i
  );
  if (streetLineMatch?.[1]) {
    const candidate = streetLineMatch[1].trim();
    if (isLikelyCityName(candidate)) {
      return candidate;
    }
  }

  const stateZipMatch = normalized.match(/([A-Za-z][A-Za-z .'-]*?)\s*,?\s+[A-Z]{2}(?:\s+\d{5}(?:-\d{4})?)?(?:,\s*[A-Z]{2})?$/);
  if (stateZipMatch?.[1]) {
    const candidate = stateZipMatch[1].split(",").map((part) => part.trim()).filter(Boolean).at(-1);
    if (candidate && isLikelyCityName(candidate)) {
      return candidate;
    }
  }

  const parts = normalized.split(",").map((part) => part.trim()).filter(Boolean);
  for (let index = parts.length - 1; index >= 0; index -= 1) {
    const candidate = parts[index];
    if (isLikelyCityName(candidate)) {
      return candidate;
    }
  }

  return null;
}

export function stringOrNull(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function isLikelyCityName(value) {
  const candidate = stringOrNull(value);
  if (!candidate) {
    return false;
  }

  if (/\d/.test(candidate)) {
    return false;
  }

  const normalized = candidate.toUpperCase();
  if (/^[A-Z]{2}$/.test(normalized)) {
    return false;
  }

  if (normalized === "USA" || normalized === "US") {
    return false;
  }

  if (/\b(?:SUITE|STE|FLOOR|FL|UNIT|BLDG|BUILDING)\b/i.test(candidate)) {
    return false;
  }

  return true;
}

export function parseCsv(value) {
  return new Set(
    String(value)
      .split(",")
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean)
  );
}

export function parseCsvList(value) {
  return String(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function parseDiceRegions(value) {
  if (!value) {
    return DEFAULT_DICE_REGIONS;
  }

  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) {
      return DEFAULT_DICE_REGIONS;
    }

    const regions = parsed
      .map((item) => ({
        mode: stringOrNull(item?.mode) ?? "browse",
        name: stringOrNull(item?.name),
        city: stringOrNull(item?.city),
        region: stringOrNull(item?.region) ?? "CA",
        country: stringOrNull(item?.country) ?? "US",
        browseUrl: stringOrNull(item?.browseUrl),
        cityNames: Array.isArray(item?.cityNames) ? item.cityNames.map((city) => stringOrNull(city)).filter(Boolean) : [],
        citySlugTerms: Array.isArray(item?.citySlugTerms) ? item.citySlugTerms.map((term) => stringOrNull(term)?.toLowerCase()).filter(Boolean) : []
      }))
      .filter((item) => item.name && item.city && (item.mode === "sitemap" ? item.citySlugTerms.length > 0 : item.browseUrl));

    return regions.length > 0 ? regions : DEFAULT_DICE_REGIONS;
  } catch {
    return DEFAULT_DICE_REGIONS;
  }
}

export function clampInteger(value, fallback, min, max) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, parsed));
}

export function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function toErrorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

export function extractNextDataJson(html) {
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

function countMatches(haystack, keywords) {
  return keywords.reduce((count, keyword) => (haystack.includes(keyword) ? count + 1 : count), 0);
}
