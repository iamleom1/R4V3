import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { analyzeEventQuality } from "../lib/event-quality.mjs";
import { deriveGenreTags, extractCityFromAddress } from "../lib/source-shared.mjs";
import { extractDiceEventFromEventPage, mapDiceEvent, regionMatchesDiceEvent } from "../sources/dice.mjs";
import { mapPoshMarketplaceEvent } from "../sources/posh.mjs";
import { extractInsomniacEvent, mapInsomniacEvent } from "../sources/insomniac.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.join(__dirname, "fixtures");

const diceRegion = {
  mode: "sitemap",
  name: "Los Angeles County",
  city: "Los Angeles",
  region: "CA",
  country: "US",
  cityNames: ["Los Angeles"]
};

const poshRegion = {
  name: "Pomona-Ontario Corridor",
  city: "Ontario",
  region: "CA",
  country: "US",
  lat: 34.0633,
  lon: -117.6509
};

test("Insomniac parser keeps Los Angeles-area events and rejects featured events elsewhere", () => {
  const eventHtml = `<script type="application/ld+json">${JSON.stringify({
    "@type": "Event", name: "Factory 93", startDate: "2099-10-16T22:00:00-07:00",
    location: { name: "NOS Event Center", address: { addressLocality: "San Bernardino,", addressRegion: "CA", addressCountry: "US" } },
    image: ["https://example.com/square.jpg", "https://example.com/flyer.jpg"], description: "Techno festival"
  })}</script>`;
  const raw = extractInsomniacEvent(eventHtml, "https://www.insomniac.com/events/factory-93/");
  const event = mapInsomniacEvent(raw, Date.parse("2099-01-01"));
  assert.equal(event.city, "San Bernardino");
  assert.equal(event.provider, "insomniac");
  assert.equal(event.flyerUrl, "https://example.com/flyer.jpg");
  assert.ok(event.genreTags.includes("techno"));
  assert.equal(mapInsomniacEvent({ ...raw, location: { address: { addressLocality: "Miami" } } }, Date.parse("2099-01-01")), null);
});

test("DICE event-page parser extracts and normalizes an EDM event", async () => {
  const html = await readFile(path.join(fixturesDir, "dice-event-page.html"), "utf8");
  const rawEvent = extractDiceEventFromEventPage(html);
  const normalized = mapDiceEvent(rawEvent, diceRegion);

  assert.ok(rawEvent);
  assert.ok(normalized);
  assert.equal(normalized.provider, "dice");
  assert.equal(normalized.providerEventId, "evt_123");
  assert.equal(normalized.city, "Los Angeles");
  assert.equal(normalized.venueName, "Sound Nightclub");
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
  assert.equal(normalized.city, "Ontario");
  assert.equal(normalized.venueName, "Ontario Warehouse");
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
      venueName: "Sound Nightclub",
      city: "Los Angeles",
      startsAt: "2026-04-12T05:00:00.000Z"
    },
    {
      provider: "posh",
      providerEventId: "evt_2",
      title: "Warehouse Techno Night",
      venueName: "Sound Nightclub",
      city: "Los Angeles",
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

test("city extraction prefers the actual city over state and zip fragments", () => {
  assert.equal(extractCityFromAddress("1642 N Las Palmas Ave, Los Angeles, CA 90028"), "Los Angeles");
  assert.equal(extractCityFromAddress("Ontario, CA 91764"), "Ontario");
  assert.equal(extractCityFromAddress("123 Main St Los Angeles CA 90028"), "Los Angeles");
  assert.equal(extractCityFromAddress("CA 90028"), null);
});
