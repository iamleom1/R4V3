import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { analyzeEventQuality } from "../lib/event-quality.mjs";
import { deriveGenreTags, extractCityFromAddress } from "../lib/source-shared.mjs";
import { extractDiceEventFromEventPage, mapDiceBrowseEvent, mapDiceEvent, regionMatchesDiceEvent } from "../sources/dice.mjs";
import { mapPoshMarketplaceEvent } from "../sources/posh.mjs";
import {
  extractInsomniacEvent,
  extractInsomniacSitemapEventUrls,
  mapExternalInsomniacListing,
  mapInsomniacEvent,
  scrapeInsomniacEvents
} from "../sources/insomniac.mjs";

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

test("Insomniac sitemap discovery adds later Los Angeles results and excludes other markets", () => {
  const sitemap = `<?xml version="1.0"?><urlset>
    <url><loc>https://www.insomniac.com/events/first-2099-01-01-los-angeles-ca/</loc></url>
    <url><loc>https://www.insomniac.com/events/later-2099-01-02-los-angeles-ca/</loc></url>
    <url><loc>https://www.insomniac.com/events/elsewhere-2099-01-03-miami-fl/</loc></url>
  </urlset>`;

  assert.deepEqual(extractInsomniacSitemapEventUrls(sitemap), [
    "https://www.insomniac.com/events/first-2099-01-01-los-angeles-ca/",
    "https://www.insomniac.com/events/later-2099-01-02-los-angeles-ca/"
  ]);
});

test("Insomniac scraper unions index and sitemap URLs without duplicate fetches", async () => {
  const firstUrl = "https://www.insomniac.com/events/first-2099-01-01-los-angeles-ca/";
  const laterUrl = "https://www.insomniac.com/events/later-2099-01-02-los-angeles-ca/";
  const calls = [];
  const eventHtml = (name, startDate) => `<script type="application/ld+json">${JSON.stringify({
    "@type": "Event",
    name,
    startDate,
    location: { name: "Venue", address: { addressLocality: "Los Angeles", addressRegion: "CA", addressCountry: "US" } }
  })}</script>`;
  const fetchText = async (url) => {
    calls.push(url);
    if (url.endsWith("/los-angeles-ca/")) return `<a href="${firstUrl}">First</a>`;
    if (url.endsWith("wp-sitemap-posts-event-1.xml")) {
      return `<urlset><url><loc>${firstUrl}</loc></url><url><loc>${laterUrl}</loc></url></urlset>`;
    }
    if (url === firstUrl) return eventHtml("First", "2099-01-01T20:00:00-08:00");
    if (url === laterUrl) return eventHtml("Later", "2099-01-02T20:00:00-08:00");
    return "";
  };

  const events = await scrapeInsomniacEvents({ fetchText, now: Date.parse("2098-01-01") });
  assert.deepEqual(events.slice(0, 2).map((event) => event.title), ["First", "Later"]);
  assert.equal(calls.filter((url) => url === firstUrl).length, 1);
});

test("Insomniac external festival listings normalize without counting as another provider", () => {
  const event = mapExternalInsomniacListing({
    name: "External Festival",
    startDate: "2099-06-11T00:00:00-07:00",
    endDate: "2099-06-13T00:00:00-07:00",
    sourceUrl: "https://festival.example.com/los-angeles/",
    city: "Los Angeles",
    genreTags: ["trance", "electronic"]
  }, Date.parse("2098-01-01"));

  assert.equal(event.provider, "insomniac");
  assert.equal(event.city, "Los Angeles");
  assert.deepEqual(event.genreTags, ["trance", "electronic"]);
  assert.equal(event.rawPayload.listedBy, "insomniac");
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

test("DICE does not infer House music from The Glass House venue", () => {
  const rawEvent = {
    id: "rock_at_glass_house",
    name: "Big Ass Truck I.E.",
    dates: { event_start_date: "2099-11-26T03:00:00.000Z" },
    venues: [{ name: "The Glass House", address: "200 W 2nd St, Pomona, CA 91766", city: { name: "Pomona" } }],
    tags: [{ name: "Rock" }]
  };

  assert.equal(mapDiceEvent(rawEvent, diceRegion), null);
  const validHouseEvent = mapDiceEvent({ ...rawEvent, id: "house_at_glass_house", name: "House Music Night", tags: [{ name: "House" }] }, diceRegion);
  assert.ok(validHouseEvent);
  assert.deepEqual(validHouseEvent.genreTags, ["house"]);
});

test("DICE does not infer House music from a venue-backed presenter", () => {
  const rawEvent = {
    id: "presenter_false_positive",
    name: "Acoustic Evening",
    presented_by: "Presented by The Glass House Concert Hall.",
    dates: { event_start_date: "2099-11-26T03:00:00.000Z" },
    venues: [{ name: "The Glass House", city: { name: "Pomona" } }]
  };

  assert.equal(mapDiceEvent(rawEvent, diceRegion), null);
});

test("POSH does not infer EDM from venue names or addresses", () => {
  const rawEvent = {
    _id: "venue_false_positive",
    name: "Local Bands Live",
    startUtc: "2099-11-26T03:00:00.000Z",
    venue: { name: "Ontario Warehouse", address: "123 House Street, Ontario, CA 91764" }
  };

  assert.equal(mapPoshMarketplaceEvent(rawEvent, poshRegion), null);
});

test("POSH rejects Tijuana events returned by a Southern California marketplace search", () => {
  const rawEvent = {
    _id: "tijuana_event",
    name: "VELVET extended Set [Hard Techno RAVE] @93HOUSE",
    startUtc: "2099-11-14T04:45:00.000Z",
    venue: {
      name: "93 HOUSE",
      address: "Av. Francisco I. Madero 1270, Zona Centro, 22000 Tijuana, B.C., Mexico"
    }
  };

  assert.equal(mapPoshMarketplaceEvent(rawEvent, poshRegion), null);
});

test("rock and hip-hop exclusions do not block trap music by substring", () => {
  const trapEvent = {
    id: "trap_show",
    name: "Trap and Bass Night",
    dates: { event_start_date: "2099-11-26T03:00:00.000Z" },
    venues: [{ name: "A Venue", city: { name: "Los Angeles" } }],
    tags: [{ name: "Trap" }]
  };

  assert.ok(mapDiceEvent(trapEvent, diceRegion));
  assert.equal(mapDiceEvent({ ...trapEvent, id: "rap_show", name: "Rap Showcase", tags: [{ name: "Rap" }] }, diceRegion), null);
});

test("DICE jazz listings are excluded even when returned by an EDM browse page", () => {
  const jazzEvent = {
    id: "jazz_sunday",
    name: "Jazz Sunday: The Jazz Bakers & Kevin Kanner Jazz",
    dates: { event_start_date: "2099-11-09T03:00:00.000Z" },
    venues: [{ name: "The Mint", city: { name: "Los Angeles" } }]
  };

  assert.equal(mapDiceEvent(jazzEvent, diceRegion, { browseHints: ["party", "Melodic house"] }), null);
});

test("DICE broad Gigs tags require event-specific EDM evidence", () => {
  const unrelatedGig = {
    id: "unrelated_gig",
    name: "House Guests Live",
    dates: { event_start_date: "2099-11-09T03:00:00.000Z" },
    venues: [{ name: "A Venue", city: { name: "Los Angeles" } }],
    tags: [{ name: "Gigs" }]
  };

  assert.equal(mapDiceEvent(unrelatedGig, diceRegion), null);
  assert.ok(mapDiceEvent({
    ...unrelatedGig,
    id: "electronic_gig",
    about: { description: "A late-night techno and house DJ set." }
  }, diceRegion));
});

test("DICE rejects unrelated pop and alternative gig descriptions", () => {
  const gig = {
    id: "alt_gig",
    name: "A Touring Band",
    dates: { event_start_date: "2099-11-09T03:00:00.000Z" },
    venues: [{ name: "A Venue", city: { name: "Los Angeles" } }],
    about: { description: "An indie pop/rock group with multiple Alt Radio singles." }
  };

  assert.equal(mapDiceEvent(gig, diceRegion), null);
});

test("DICE browse labels cannot qualify a metal event after detail enrichment", async () => {
  const browseEvent = {
    id: "metal_show",
    name: "Desert Eagle, Erscheinung, Laughing Chance",
    dates: { event_start_date: "2099-11-09T03:00:00.000Z" },
    venues: [{ name: "Oblivion", city: { name: "Highland Park" } }]
  };
  const detailEvent = {
    ...browseEvent,
    about: { description: "Black Metal Street Rock. Eerie Black Metal from the Netherlands." }
  };
  const html = `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify({
    props: { pageProps: { initialState: JSON.stringify({ event: { event: detailEvent } }) } }
  })}</script>`;

  const normalized = await mapDiceBrowseEvent(browseEvent, diceRegion, {
    fetchText: async () => html,
    browseHints: ["party", "Melodic house"],
    sourceUrl: "https://dice.fm/browse/losangeles/music/party/melodic_house"
  });

  assert.equal(normalized, null);
});

test("DICE browse events require a canonical detail payload", async () => {
  const browseEvent = {
    id: "unverified_show",
    name: "Unknown listing",
    dates: { event_start_date: "2099-11-09T03:00:00.000Z" },
    venues: [{ name: "A Venue", city: { name: "Los Angeles" } }]
  };

  assert.equal(await mapDiceBrowseEvent(browseEvent, diceRegion, {
    fetchText: async () => "",
    browseHints: ["party", "House"]
  }), null);
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
  assert.equal(extractCityFromAddress("Downtown Los Angeles, Los Angeles, CA, USA"), "Los Angeles");
  assert.equal(extractCityFromAddress("Los Angeles, CA, USA"), "Los Angeles");
  assert.equal(extractCityFromAddress("Anaheim, CA, USA"), "Anaheim");
  assert.equal(extractCityFromAddress("1022 El Centro Street, South Pasadena, California 91030, United States"), "South Pasadena");
  assert.equal(extractCityFromAddress("CA 90028"), null);
});

test("DICE prefers its structured city over address parsing", () => {
  const rawEvent = {
    id: "pasadena_event",
    name: "Pasadena House DJ Night",
    dates: { event_start_date: "2099-11-09T01:00:00.000Z" },
    venues: [{
      name: "Sid The Cat Auditorium",
      address: "1022 El Centro Street, South Pasadena, California 91030, United States",
      city: { name: "Pasadena" }
    }],
    tags: [{ name: "House" }]
  };

  assert.equal(mapDiceEvent(rawEvent, diceRegion)?.city, "Pasadena");
});

test("POSH extracts Los Angeles from its displayed source location", () => {
  const rawEvent = {
    _id: "downtown_la_event",
    name: "KITTY RAVE D4X2",
    startUtc: "2099-11-21T07:15:00.000Z",
    venue: {
      name: "D4X2 Z3",
      address: "Downtown Los Angeles, Los Angeles, CA, USA"
    }
  };

  assert.equal(mapPoshMarketplaceEvent(rawEvent, { ...poshRegion, city: "Los Angeles County" })?.city, "Los Angeles");
});
