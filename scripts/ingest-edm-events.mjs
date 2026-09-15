import { createClient } from "@supabase/supabase-js";
import { fetchJson, fetchText } from "./lib/http.mjs";
import { persistEvents, tryRecordJobRun } from "./lib/persist-events.mjs";
import { loadPromoterSources, recordPromoterFetch } from "./lib/promoter-sources.mjs";
import {
  clampInteger,
  dedupeScrapedEvents,
  parseCsv,
  parseCsvList,
  parseDiceRegions,
  requireEnv,
  summarizeBySource,
  toErrorMessage
} from "./lib/source-shared.mjs";
import { scrapeDicePromoters, scrapeDiceRegions } from "./sources/dice.mjs";
import { scrapePoshPromoters, scrapePoshRegions } from "./sources/posh.mjs";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const POSH_REGIONS = [
  { name: "Los Angeles County", city: "Los Angeles County", region: "CA", country: "US", lat: 34.0522, lon: -118.2437 },
  { name: "Orange County", city: "Orange County", region: "CA", country: "US", lat: 33.7175, lon: -117.8311 },
  { name: "San Diego County", city: "San Diego County", region: "CA", country: "US", lat: 32.7157, lon: -117.1611 },
  { name: "San Bernardino County", city: "San Bernardino County", region: "CA", country: "US", lat: 34.1083, lon: -117.2898 },
  { name: "Riverside County", city: "Riverside County", region: "CA", country: "US", lat: 33.9806, lon: -117.3755 }
];

const HEADERS = {
  "user-agent": USER_AGENT,
  "accept-language": "en-US,en;q=0.9"
};

const REQUEST_TIMEOUT_MS = 30000;
const POSH_LIMIT_PER_REGION = clampInteger(process.env.POSH_LIMIT_PER_REGION, 60, 1, 100);
const POSH_WHENS = parseCsvList(process.env.POSH_WHENS || "This Week,This Month");
const DICE_REGIONS = parseDiceRegions(process.env.DICE_REGIONS_JSON);
const ENABLED_SOURCES = parseCsv(process.env.EDM_SCRAPER_SOURCES || "dice,posh");
const DRY_RUN = (process.env.DRY_RUN || "false").toLowerCase() === "true";
const POSH_PROMOTERS_ONLY = (process.env.POSH_PROMOTERS_ONLY || "false").toLowerCase() === "true";
const PROMOTERS_ONLY = (process.env.PROMOTERS_ONLY ?? String(POSH_PROMOTERS_ONLY)).toLowerCase() === "true";

async function main() {
  if (PROMOTERS_ONLY && !ENABLED_SOURCES.has("posh") && !ENABLED_SOURCES.has("dice")) {
    throw new Error("PROMOTERS_ONLY requires posh or dice in EDM_SCRAPER_SOURCES");
  }
  const admin = DRY_RUN && !(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY)
    ? null
    : createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
        auth: { persistSession: false, autoRefreshToken: false }
      });

  try {
    const scraped = [];
    let promoterResults = [];
    const fetchOptions = {
      headers: HEADERS,
      requestTimeoutMs: REQUEST_TIMEOUT_MS
    };

    const promoterSources = admin && (ENABLED_SOURCES.has("dice") || ENABLED_SOURCES.has("posh"))
      ? await loadPromoterSources(admin)
      : [];
    if (!admin && (ENABLED_SOURCES.has("dice") || ENABLED_SOURCES.has("posh"))) {
      if (PROMOTERS_ONLY) throw new Error("Promoter dry runs require Supabase credentials to read approved sources");
      console.warn("[promoters] skipping database promoter sources: no Supabase credentials (dry run)");
    }

    if (ENABLED_SOURCES.has("dice")) {
      const promoterRun = await scrapeDicePromoters({
        promoters: promoterSources.filter((source) => source.provider === "dice"),
        fetchText: (url) => fetchText(url, { ...fetchOptions, headers: { ...HEADERS, "user-agent": "Googlebot" } })
      });
      scraped.push(...promoterRun.events);
      promoterResults.push(...promoterRun.results);
    }

    if (ENABLED_SOURCES.has("dice") && !PROMOTERS_ONLY) {
      scraped.push(...(await scrapeDiceRegions({
        regions: DICE_REGIONS,
        fetchText: (url) => fetchText(url, fetchOptions)
      })));
    }

    if (ENABLED_SOURCES.has("posh")) {
      if (admin) {
        const promoterRun = await scrapePoshPromoters({
          promoters: promoterSources.filter((source) => source.provider === "posh"),
          fetchJson: (url) => fetchJson(url, fetchOptions)
        });
        // Prefer the richer organizer payload when regional discovery finds the same ID.
        scraped.push(...promoterRun.events);
        promoterResults.push(...promoterRun.results);
      }
      if (!PROMOTERS_ONLY) scraped.push(...(await scrapePoshRegions({
        regions: POSH_REGIONS,
        whens: POSH_WHENS,
        limitPerRegion: POSH_LIMIT_PER_REGION,
        fetchJson: (url) => fetchJson(url, fetchOptions)
      })));
    }

    if (!DRY_RUN && admin) {
      for (const result of promoterResults) await recordPromoterFetch(admin, result);
    }

    const deduped = dedupeScrapedEvents(scraped);
    const promoterFailures = promoterResults.filter((result) => result.status === "failure");
    if (DRY_RUN) {
      console.log(
        JSON.stringify(
          {
            ok: promoterFailures.length === 0,
            dryRun: true,
            fetched: deduped.length,
            bySource: summarizeBySource(deduped),
            promoters: promoterResults
          },
          null,
          2
        )
      );
      if (promoterFailures.length) process.exitCode = 1;
      return;
    }

    const result = await persistEvents(admin, deduped);
    const details = {
      fetched: deduped.length,
      inserted: result.inserted,
      updated: result.updated,
      by_source: summarizeBySource(deduped),
      sources: Array.from(ENABLED_SOURCES),
      promoters: promoterResults
    };

    await tryRecordJobRun(admin, promoterFailures.length ? "failure" : "success", details);

    console.log(
      JSON.stringify(
        {
          ok: promoterFailures.length === 0,
          ...details
        },
        null,
        2
      )
    );
    if (promoterFailures.length) process.exitCode = 1;
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

await main();
