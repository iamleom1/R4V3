# Curation and autosave fixes

Migration `supabase/migrations/0048_curation_pagination_and_visibility.sql` must be applied through the normal database migration process before releasing the updated client. It has been prepared locally; no remote migration has been applied.

- `list_curated_events` now accepts `p_offset` and orders tied events by ID. Its default offset preserves existing two-argument calls. The old two-argument function is replaced to avoid ambiguous RPC overloads.
- `upsert_curated_event` accepts an existing `p_event_id` with an omitted/null `p_title` as a visibility-only operation. It atomically updates the anchor and same-title/city events within six hours, returning all affected IDs. This path checks moderator authorization and changes only visibility and the update timestamp. Ordinary create/edit calls retain duplicate validation.
- The client uses that visibility-only call only when `moderator_set_event_hidden_globally` is missing from the schema cache. Migration 0047 remains the primary hide path. An older backend without 0048 still cannot serve offset pagination or the revised fallback; the client cannot supply missing database behavior.
- Same-user auth events preserve profile hydration and autosaving; changing users still triggers hydration.

## Local verification

Run from the repository root:

```sh
pnpm typecheck
pnpm --filter @r4v3/mobile exec jest --runInBand
pnpm test:edm
git diff --check
```

The SQL regression suite runs the checked-in SQL in an isolated, in-memory PostgreSQL runtime. Install its test-only runtime outside the repository, then run:

```sh
npm install --prefix /private/tmp/r4v3-curation-sql-review --no-package-lock --ignore-scripts @electric-sql/pglite@0.5.8
R4V3_PGLITE_MODULE=/private/tmp/r4v3-curation-sql-review/node_modules/@electric-sql/pglite node --test supabase/tests/curation.test.mjs
```

The suite covers pagination beyond 200 rows, stable ordering, legacy list calls, past filtering, duplicate hide/show across midnight, metadata preservation, primary/fallback agreement, duplicate rejection for normal edits, missing IDs, and moderator checks. It applies migrations 0039, 0047, and 0048 against a minimal events fixture with a stubbed moderator predicate. It does not validate the full Supabase migration history, deployed roles/RLS, PostgREST schema-cache routing, or native-device behavior. After deployment, verify both RPC signatures through PostgREST and confirm hidden events can be restored from the moderator screen.
