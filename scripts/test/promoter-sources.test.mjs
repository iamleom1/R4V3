import test from "node:test";
import assert from "node:assert/strict";
import { scrapeDicePromoters } from "../sources/dice.mjs";
import { scrapePoshPromoters } from "../sources/posh.mjs";
import { dedupeScrapedEvents } from "../lib/source-shared.mjs";
import { loadPromoterSources, recordPromoterFetch } from "../lib/promoter-sources.mjs";

const promoter = { id: "source-1", organizer_slug: "techtonik", default_city: "Los Angeles", default_region: "CA", default_country: "US" };
const event = {
  id: "posh-event-1", name: "ANGEL CANNON", url: "angel-cannon", status: "live",
  startUtc: "2026-10-11T06:45:00Z", endUtc: "2026-10-11T12:00:00Z",
  displayOnThirdPartySites: true, passwordProtected: false,
  venue: { name: "", address: "The location will be revealed on the event date." }
};
const payload = (events = [event]) => ({ group: { _id: "group-1", url: "techtonik", name: "TECHTONIK" }, events });
const run = (fetchJson, promoters = [promoter]) => scrapePoshPromoters({ promoters, fetchJson, now: Date.parse("2026-09-15T00:00:00Z") });
const dicePromoter = { ...promoter, provider: "dice", organizer_slug: "framework-y7q2" };
const diceEvent = {
  id: "dice-event-1", name: "Artist-only title", status: "on-sale",
  dates: { event_start_date: "2026-10-17T23:00:00-07:00", event_end_date: "2026-10-18T07:00:00-07:00" },
  venues: [{ name: "Secret Warehouse", address: "Los Angeles, CA", city: { name: "Los Angeles" } }],
  images: { square: "https://cdn.example.com/dice.jpg" }
};
function diceHtml(profile = {}) {
  const data = { props: { pageProps: { profile: {
    promoter: { id: "6888", name: "Framework", slug: "framework-y7q2" },
    sections: [{ events: [diceEvent], items: [{ type: "event", event: diceEvent }] }],
    ...profile
  } } } };
  return `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify(data)}</script>`;
}

test("organizer events retain POSH IDs, include artist-only titles, and use city fallback for secret venues", async () => {
  const result = await run(async (url) => {
    assert.equal(url, "https://posh.vip/api/web/v2/util/group_url/techtonik");
    return payload();
  });
  assert.equal(result.results[0].status, "success");
  const normalized = result.events[0];
  assert.equal(normalized.providerEventId, event.id);
  assert.equal(normalized.city, "Los Angeles");
  assert.equal(normalized.venueName, null);
  assert.equal(normalized.startsAt, "2026-10-11T06:45:00.000Z");
  assert.equal(normalized.rawPayload.canonicalUrl, "https://posh.vip/e/angel-cannon");
  assert.equal(dedupeScrapedEvents([normalized, { ...normalized, description: "regional" }]).length, 1);
});

test("private, ended, cancelled, and password-protected events are excluded", async () => {
  const result = await run(async () => payload([
    event,
    { ...event, displayOnThirdPartySites: false },
    { ...event, displayOnThirdPartySites: undefined },
    { ...event, passwordProtected: true },
    { ...event, status: "cancelled" },
    { ...event, endUtc: "2026-09-01T00:00:00Z" }
  ]));
  assert.equal(result.events.length, 1);
});

test("failures are distinct from an empty organizer and do not block other promoters", async () => {
  const result = await run(async url => url.endsWith("/broken") ? null : payload([]), [
    { ...promoter, id: "source-2", organizer_slug: "broken" }, promoter
  ]);
  assert.deepEqual(result.results.map(r => r.status), ["failure", "success"]);
  assert.equal(result.results[1].eventCount, 0);
  for (const badPayload of [payload([{ ...event, id: null }]), { ...payload(), group: { _id: "other", url: "other" } }]) {
    assert.equal((await run(async () => badPayload)).results[0].status, "failure");
  }
  assert.equal((await run(() => { throw new Error("Must not fetch"); }, [{ ...promoter, organizer_slug: "../private" }])).results[0].error, "Invalid POSH organizer slug");
});

test("DICE promoter pages normalize and dedupe future events without requiring title keywords", async () => {
  const result = await scrapeDicePromoters({
    promoters: [dicePromoter], fetchText: async url => {
      assert.equal(url, "https://dice.fm/promoters/framework-y7q2?lng=en-US");
      return diceHtml();
    }, now: Date.parse("2026-09-15T00:00:00Z")
  });
  assert.deepEqual(result.results, [{ sourceId: "source-1", slug: "framework-y7q2", provider: "dice", status: "success", eventCount: 1 }]);
  assert.equal(result.events[0].providerEventId, "dice-event-1");
  assert.equal(result.events[0].rawPayload.__diceBrowseContext.sourceUrl, "https://dice.fm/event/dice-event-1");
  assert.equal(result.events[0].rawPayload.organizerUrl, "https://dice.fm/promoters/framework-y7q2");
});

test("DICE promoter validation rejects mismatches and skips ended or cancelled events", async () => {
  const mismatch = await scrapeDicePromoters({ promoters: [dicePromoter], fetchText: async () => diceHtml({ promoter: { id: "1", slug: "other" } }) });
  assert.equal(mismatch.results[0].status, "failure");
  const filtered = await scrapeDicePromoters({
    promoters: [dicePromoter],
    fetchText: async () => diceHtml({ sections: [{ events: [
      { ...diceEvent, status: "cancelled" },
      { ...diceEvent, id: "ended", dates: { ...diceEvent.dates, event_end_date: "2026-09-01T00:00:00Z" } }
    ] }] }),
    now: Date.parse("2026-09-15T00:00:00Z")
  });
  assert.equal(filtered.results[0].status, "success");
  assert.equal(filtered.events.length, 0);
  const invalid = await scrapeDicePromoters({ promoters: [{ ...dicePromoter, organizer_slug: "../bad" }], fetchText: async () => diceHtml() });
  assert.equal(invalid.results[0].error, "Invalid DICE promoter slug");
});

test("database loading filters approved enabled promoter sources and paginates", async () => {
  const filters = [];
  const pages = [];
  const admin = { from(table) {
    assert.equal(table, "promoter_sources");
    return {
      select() { return this; }, eq(...args) { filters.push(args); return this; },
      order(column) { assert.equal(column, "id"); return this; },
      async range(start, end) { pages.push([start, end]); return { data: start === 0 ? Array(500).fill(promoter) : [promoter] }; }
    };
  } };
  assert.equal((await loadPromoterSources(admin)).length, 501);
  assert.deepEqual(filters.slice(0, 2), [["status", "approved"], ["enabled", true]]);
  assert.deepEqual(pages, [[0, 499], [500, 999]]);
});

test("fetch telemetry clears stale errors on recovery and surfaces database errors", async () => {
  let update;
  const admin = { from() { return { update(value) { update = value; return this; }, async eq(key, id) {
    assert.equal(key, "id"); assert.equal(id, promoter.id); return {};
  } }; } };
  await recordPromoterFetch(admin, { sourceId: promoter.id, status: "success", eventCount: 2 });
  assert.equal(update.last_error, null);
  assert.equal(update.last_event_count, 2);
  await recordPromoterFetch(admin, { sourceId: promoter.id, status: "failure", error: "Unavailable" });
  assert.equal(update.last_event_count, null);
  assert.equal(update.last_error, "Unavailable");
  const broken = { from() { return { update() { return this; }, async eq() { return { error: { message: "denied" } }; } }; } };
  await assert.rejects(recordPromoterFetch(broken, { sourceId: promoter.id, status: "success", eventCount: 0 }), /denied/);
});
