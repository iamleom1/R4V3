import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { test } from "node:test";

const require = createRequire(import.meta.url);
const { PGlite } = require(process.env.R4V3_PGLITE_MODULE ?? "@electric-sql/pglite");

test("promoter migration enforces approval, supported slugs, uniqueness and client access restrictions", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create function public.set_updated_at() returns trigger language plpgsql as
        $$ begin new.updated_at = now(); return new; end; $$;
    `);
    await db.exec(await readFile(new URL("../migrations/0049_promoter_sources.sql", import.meta.url), "utf8"));
    await db.exec(await readFile(new URL("../migrations/0050_dice_promoter_sources.sql", import.meta.url), "utf8"));
    const { rows } = await db.query("select * from public.promoter_sources");
    assert.equal(rows[0].organizer_url, "https://posh.vip/g/techtonik");
    assert.equal(rows[0].status, "approved");
    assert.equal(rows[0].enabled, true);
    await db.exec("insert into public.promoter_sources(name, provider, organizer_slug, default_city, status, enabled) values ('Framework', 'dice', 'framework-y7q2', 'Los Angeles', 'approved', true)");
    assert.equal((await db.query("select organizer_url from public.promoter_sources where provider = 'dice'")).rows[0].organizer_url, "https://dice.fm/promoters/framework-y7q2");
    await db.exec("insert into public.promoter_sources(name, organizer_slug, default_city) values ('New promoter', 'new-promoter', 'San Diego')");
    const pending = (await db.query("select status, enabled from public.promoter_sources where organizer_slug = 'new-promoter'")).rows[0];
    assert.deepEqual(pending, { status: "pending", enabled: false });
    await assert.rejects(db.exec("update public.promoter_sources set enabled = true where organizer_slug = 'new-promoter'"));
    await assert.rejects(db.exec("update public.promoter_sources set organizer_slug = '../bad' where organizer_slug = 'new-promoter'"));
    await assert.rejects(db.exec("update public.promoter_sources set organizer_slug = 'techtonik' where organizer_slug = 'new-promoter'"));
    await assert.rejects(db.exec("update public.promoter_sources set provider = 'unsupported'"));
    for (const role of ["anon", "authenticated"]) {
      await db.exec(`set role ${role}`);
      await assert.rejects(db.exec("select * from public.promoter_sources"));
      await assert.rejects(db.exec("update public.promoter_sources set status = 'approved', enabled = true"));
      await assert.rejects(db.exec("insert into public.promoter_sources(name, organizer_slug, default_city) values ('Bad', 'bad', 'LA')"));
      await db.exec("reset role");
    }
    await db.exec("set role service_role");
    await db.exec("update public.promoter_sources set status = 'approved', enabled = true where organizer_slug = 'new-promoter'");
    assert.equal((await db.query("select * from public.promoter_sources where enabled and status = 'approved'")).rows.length, 3);
  } finally { await db.close(); }
});
