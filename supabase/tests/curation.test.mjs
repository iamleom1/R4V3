import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { before, after, beforeEach, test } from "node:test";

const require = createRequire(import.meta.url);
const { PGlite } = require(process.env.R4V3_PGLITE_MODULE ?? "@electric-sql/pglite");
let database;

before(async () => {
  database = new PGlite();
  await database.exec(`
    create role authenticated;
    create function public.is_current_user_moderator() returns boolean language sql as
      $$ select coalesce(current_setting('test.is_moderator', true), 'false') = 'true' $$;
    create table public.events (
      id uuid primary key default gen_random_uuid(), title text not null,
      venue_name text, city text, region text, country text,
      starts_at timestamptz not null, ends_at timestamptz, genre_tags text[] default '{}',
      source_primary text not null default 'manual', is_featured boolean default false,
      promotion_rank int default 0, featured_until timestamptz, curation_note text,
      flyer_url text, updated_at timestamptz default now()
    );
  `);
  for (const filename of [
    "0039_event_hide_from_discovery.sql",
    "0047_moderator_set_event_hidden_globally.sql",
    "0048_curation_pagination_and_visibility.sql"
  ]) {
    await database.exec(await readFile(new URL(`../migrations/${filename}`, import.meta.url), "utf8"));
  }
});

after(async () => database?.close());

beforeEach(async () => {
  await database.exec("truncate public.events; set test.is_moderator = 'true';");
});

test("pagination reaches hidden events after 200 visible rows with stable ties", async () => {
  await database.exec(`
    insert into public.events (id, title, starts_at, is_hidden)
    select md5(sequence::text)::uuid, 'Event ' || sequence, '2099-01-01', sequence = 202
    from generate_series(1, 202) sequence;
  `);
  const first = await database.query("select * from public.list_curated_events(false, 200, 0)");
  const second = await database.query("select * from public.list_curated_events(false, 200, 200)");
  assert.equal(first.rows.length, 200);
  assert.equal(second.rows.length, 2);
  assert.equal(second.rows[1].is_hidden, true);
  const visibleIds = [...first.rows, second.rows[0]].map((row) => row.event_id);
  assert.deepEqual(visibleIds, [...visibleIds].sort());
  assert.equal(new Set([...first.rows, ...second.rows].map((row) => row.event_id)).size, 202);
  const legacy = await database.query("select * from public.list_curated_events(false, 200)");
  assert.deepEqual(legacy.rows, first.rows);
});

test("pagination preserves past filtering and clamps negative offsets", async () => {
  await database.exec("insert into public.events (title, starts_at) values ('Past', '2000-01-01'), ('Future', '2099-01-01')");
  const upcoming = await database.query("select * from public.list_curated_events(false, 200, -1)");
  const all = await database.query("select * from public.list_curated_events(true, 200, 0)");
  assert.deepEqual(upcoming.rows.map((row) => row.title), ["Future"]);
  assert.deepEqual(all.rows.map((row) => row.title), ["Past", "Future"]);
});

async function seedDuplicates() {
  await database.exec(`
    insert into public.events (id, title, city, region, country, starts_at, curation_note)
    values
      ('00000000-0000-0000-0000-000000000001', 'Duplicate', 'Toronto', 'ON', 'CA', '2099-01-01T23:00:00Z', 'Keep this note'),
      ('00000000-0000-0000-0000-000000000002', 'DUPLICATE', ' toronto ', 'ON', 'CA', '2099-01-02T01:00:00Z', 'Keep this too'),
      ('00000000-0000-0000-0000-000000000003', 'Duplicate', 'Toronto', 'ON', 'CA', '2099-01-02T06:00:00Z', 'Outside window');
  `);
}

test("legacy visibility-only calls hide and restore duplicates without changing metadata", async () => {
  await seedDuplicates();
  const snapshot = async () => (await database.query("select to_jsonb(events) - 'is_hidden' - 'updated_at' as metadata from events order by id")).rows;
  const original = await snapshot();
  for (const isHidden of [true, false]) {
    const result = await database.query(
      "select * from public.upsert_curated_event(p_event_id => '00000000-0000-0000-0000-000000000001', p_is_hidden => $1)",
      [isHidden]
    );
    assert.equal(result.rows.length, 2);
    assert.ok(result.rows.every((row) => row.is_hidden === isHidden));
    assert.deepEqual(await snapshot(), original);
    const outside = await database.query("select is_hidden from events where id = '00000000-0000-0000-0000-000000000003'");
    assert.equal(outside.rows[0].is_hidden, false);
  }
});

test("primary and legacy hide paths update the same duplicate IDs", async () => {
  await seedDuplicates();
  const primary = await database.query("select * from public.moderator_set_event_hidden_globally('00000000-0000-0000-0000-000000000001', true)");
  const legacy = await database.query("select * from public.upsert_curated_event(p_event_id => '00000000-0000-0000-0000-000000000001', p_is_hidden => false)");
  assert.deepEqual(primary.rows.map((row) => row.event_id).sort(), legacy.rows.map((row) => row.event_id).sort());
});

test("ordinary create and edit calls still reject duplicates", async () => {
  await seedDuplicates();
  await assert.rejects(database.query("select * from public.upsert_curated_event(p_title => 'Duplicate', p_city => 'Toronto', p_starts_at => '2099-01-01T23:00:00Z')"), /duplicate_event/);
  await assert.rejects(database.query("select * from public.upsert_curated_event(p_event_id => '00000000-0000-0000-0000-000000000001', p_title => 'Duplicate', p_city => 'Toronto', p_starts_at => '2099-01-01T23:00:00Z')"), /duplicate_event/);
});

test("visibility-only calls reject nonexistent events", async () => {
  await assert.rejects(database.query("select * from public.upsert_curated_event(p_event_id => '00000000-0000-0000-0000-000000000001', p_is_hidden => true)"), /event_not_found/);
});

test("curation and visibility-only calls still require moderator authorization", async () => {
  await seedDuplicates();
  await database.exec("set test.is_moderator = 'false'");
  await assert.rejects(database.query("select * from public.list_curated_events(false, 200, 0)"), /moderator_required/);
  await assert.rejects(database.query("select * from public.upsert_curated_event(p_event_id => '00000000-0000-0000-0000-000000000001', p_is_hidden => true)"), /moderator_required/);
  const result = await database.query("select count(*)::int as hidden_count from events where is_hidden");
  assert.equal(result.rows[0].hidden_count, 0);
});
