import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { analyzeEventQuality } from "../lib/event-quality.mjs";
import { deriveGenreTags } from "../lib/source-shared.mjs";
import { extractDiceEventFromEventPage, mapDiceEvent, regionMatchesDiceEvent } from "../sources/dice.mjs";
import { mapPoshMarketplaceEvent } from "../sources/posh.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.join(__dirname, "fixtures");

const diceRegion = {
  mode: "sitemap",
  name: "San Diego County",
  city: "San Diego",
  region: "CA",
  country: "US",
  cityNames: ["San Diego"]
};

const poshRegion = {
  name: "Orange County",
  city: "Orange County",
  region: "CA",
  country: "US",
  lat: 33.7175,
  lon: -117.8311
};

test("DICE event-page parser extracts and normalizes an EDM event", async () => {
  const html = await readFile(path.join(fixturesDir, "dice-event-page.html"), "utf8");
  const rawEvent = extractDiceEventFromEventPage(html);
  const normalized = mapDiceEvent(rawEvent, diceRegion);

  assert.ok(rawEvent);
  assert.ok(normalized);
  assert.equal(normalized.provider, "dice");
  assert.equal(normalized.providerEventId, "evt_123");
  assert.equal(normalized.city, "San Diego");
  assert.equal(normalized.venueName, "Nova SD");
  assert.equal(normalized.flyerUrl, "https://cdn.example.com/flyer.jpg");
  assert.equal(regionMatchesDiceEvent(normalized, rawEvent, diceRegion), true);
  assert.ok(normalized.genreTags.includes("techno"));
  assert.ok(normalized.genreTags.includes("house"));
});

test("POSH marketplace mapper normalizes an EDM event", async () => {
  const rawEvent = JSON.parse(await readFile(path.join(fixturesDir, "posh-marketplace-event.json"), "utf8"));
  const normalized = mapPoshMarketplaceEvent(rawEvent, poshRegion);

  assert.ok(normalized);
  assert.equal(normalized.provider, "posh");
  assert.equal(normalized.providerEventId, "posh_evt_123");
  assert.equal(normalized.city, "Costa Mesa");
  assert.equal(normalized.venueName, "Costa Mesa Warehouse");
  assert.equal(normalized.flyerUrl, "https://cdn.example.com/posh-flyer.jpg");
  assert.ok(normalized.genreTags.includes("house"));
  assert.ok(normalized.genreTags.includes("techno"));
});

test("event quality analyzer flags duplicates and malformed events", () => {
  const { duplicateCount, badEventCount, duplicates, badEvents } = analyzeEventQuality([
    {
      provider: "dice",
      providerEventId: "evt_1",
      title: "Warehouse Techno Night",
      venueName: "Nova SD",
      city: "San Diego",
      startsAt: "2026-04-12T05:00:00.000Z"
    },
    {
      provider: "posh",
      providerEventId: "evt_2",
      title: "Warehouse Techno Night",
      venueName: "Nova SD",
      city: "San Diego",
      startsAt: "2026-04-12T05:00:00.000Z"
    },
    {
      provider: "dice",
      providerEventId: "evt_3",
      title: "",
      venueName: null,
      city: "Los Angeles",
      startsAt: "not-a-date"
    }
  ]);

  assert.equal(duplicateCount, 1);
  assert.equal(badEventCount, 1);
  assert.equal(duplicates[0].duplicate.provider, "posh");
  assert.deepEqual(badEvents[0].issues, ["missing_title", "missing_venue", "invalid_starts_at"]);
});

test("genre derivation captures hard techno and afters labels", () => {
  const tags = deriveGenreTags("Hard Techno afterhours warehouse rave with industrial techno selectors");

  assert.ok(tags.includes("hard techno"));
  assert.ok(tags.includes("afters"));
  assert.ok(tags.includes("rave"));
});
