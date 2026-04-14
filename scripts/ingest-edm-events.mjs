import { createClient } from "@supabase/supabase-js";
import { fetchJson, fetchText } from "./lib/http.mjs";
import { persistEvents, tryRecordJobRun } from "./lib/persist-events.mjs";
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
import { scrapeDiceRegions } from "./sources/dice.mjs";
import { scrapePoshRegions } from "./sources/posh.mjs";

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

async function main() {
  const admin = DRY_RUN
    ? null
    : createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
        auth: { persistSession: false, autoRefreshToken: false }
      });

  try {
    const scraped = [];
    const fetchOptions = {
      headers: HEADERS,
      requestTimeoutMs: REQUEST_TIMEOUT_MS
    };

    if (ENABLED_SOURCES.has("dice")) {
      scraped.push(...(await scrapeDiceRegions({
        regions: DICE_REGIONS,
        fetchText: (url) => fetchText(url, fetchOptions)
      })));
    }

    if (ENABLED_SOURCES.has("posh")) {
      scraped.push(...(await scrapePoshRegions({
        regions: POSH_REGIONS,
        whens: POSH_WHENS,
        limitPerRegion: POSH_LIMIT_PER_REGION,
        fetchJson: (url) => fetchJson(url, fetchOptions)
      })));
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

await main();
