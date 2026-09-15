# EDM Scraper Ingestion

This repo now includes a standalone ingestion script for external EDM listings from:

- `dice.fm`
- `posh.vip`

It writes into the existing Supabase `events` and `event_sources` tables instead of using the `ingest-events` Edge Function. This is intentional:

- `dice.fm` can be scraped from server-rendered `__NEXT_DATA__`
- `posh.vip` exposes a public marketplace API the script can query directly
- this keeps ingestion in a simple Node runtime while still writing to the same Supabase tables

## Files

- Script: `scripts/ingest-edm-events.mjs`
- Migration: `supabase/migrations/0022_allow_posh_dice_event_sources.sql`

## Install

```bash
pnpm install
```

## Required environment variables

```bash
export SUPABASE_URL="https://<project>.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="<service-role-key>"
```

## Optional environment variables

```bash
export EDM_SCRAPER_SOURCES="dice,posh"
export POSH_LIMIT_PER_REGION="60"
export POSH_WHENS="This Week,This Month"
export DICE_REGIONS_JSON='[{"name":"Los Angeles County","city":"Los Angeles","browseUrl":"https://dice.fm/browse/losangeles-5982e13c613de866017c3e3a?lng=en-US"},{"name":"Orange County","city":"Orange County","browseUrl":"https://dice.fm/browse/<validated-orange-county-url>"},{"name":"San Diego County","city":"San Diego","browseUrl":"https://dice.fm/browse/<validated-san-diego-url>"}]'
export DRY_RUN="false"
```

## Promoters managed in Supabase

Migrations `0049_promoter_sources.sql` and `0050_dice_promoter_sources.sql` create
the registry and enable POSH and DICE sources. The first migration seeds TECHTONIK
as approved and enabled. Adding promoters requires no app release or code change.

### Add or approve a promoter

In Supabase's Table Editor, open `public.promoter_sources` and insert a row:

| Field | Value |
| --- | --- |
| `name` | Promoter display name |
| `provider` | `posh` or `dice` |
| `organizer_slug` | The part after `/g/` on POSH or `/promoters/` on DICE |
| `default_city` | Their usual city, used when an event's location is undisclosed |
| `default_region` / `default_country` | Defaults to `CA` / `US`; change for other locations |
| `status` | `pending` until reviewed, then `approved` or `rejected` |
| `enabled` | Set to `true` only after approval |

For example, `https://dice.fm/promoters/framework-y7q2` uses provider `dice` and
slug `framework-y7q2`. `organizer_url` is generated automatically. Slugs must be lowercase letters,
numbers, or hyphens. Duplicate organizer entries and enabling unapproved entries
are rejected by the database. Review the organizer's identity and EDM relevance
before approval: approved organizer events do not require EDM title keywords.

Incoming requests can be recorded as pending rows by an admin. This initial
workflow uses the Supabase dashboard; a public self-service submission form is
not included. App clients and anonymous visitors cannot read or edit this table.
Dashboard administrators and the backend service role manage it.

The existing 12-hour ingest reads approved, enabled sources on every run. Both
adapters verify that the returned organizer slug matches the configured slug and
only import future, non-cancelled listings. POSH also excludes password-protected
events and listings not marked for third-party display. Organizer results take
precedence over regional results with the same provider event ID.

Set `enabled = false` to stop direct fetching. Disable before marking a source
rejected. This does not delete existing events or prevent regional marketplace
discovery. Cancellation/removal reconciliation is not part of this change; use
existing event moderation to hide previously imported listings when needed.

### Verify a promoter

With the existing Supabase credentials configured, run a read-only preview:

```bash
DRY_RUN=true PROMOTERS_ONLY=true EDM_SCRAPER_SOURCES=posh,dice pnpm ingest:edm
```

This reads the database but writes neither events nor fetch telemetry. A dry run
without credentials can still preview regional discovery; it explicitly skips
database promoters. Promoter-only previews require credentials.

After a normal run, check `last_fetched_at`, `last_fetch_status`, `last_event_count`,
and `last_error`. These describe fetching, not successful event persistence; check
the overall ingest job for persistence failures. A valid empty organizer response
records success with zero events. A broken response records failure, other sources
continue, and the job exits unsuccessfully after saving successfully fetched events.
Missing/unreadable source configuration fails the job rather than silently using
an obsolete local list.

Validation: `pnpm test:edm` covers the adapter and database loader. SQL permissions
and constraints are checked in `supabase/tests/promoter-sources.test.mjs`, using
the same isolated PGlite runtime pattern as the curation SQL tests:

```bash
npm install --prefix /private/tmp/r4v3-promoter-sql-review --no-package-lock --ignore-scripts @electric-sql/pglite@0.5.8
R4V3_PGLITE_MODULE=/private/tmp/r4v3-promoter-sql-review/node_modules/@electric-sql/pglite node --test supabase/tests/promoter-sources.test.mjs
```

## Run

```bash
pnpm ingest:edm
```

Safe smoke test without Supabase writes:

```bash
DRY_RUN=true EDM_SCRAPER_SOURCES=dice pnpm ingest:edm
```

Expected output shape:

```json
{
  "ok": true,
  "fetched": 52,
  "inserted": 34,
  "updated": 18,
  "bySource": {
    "dice": 12,
    "posh": 40
  }
}
```

## Notes

- Apply migration `0022_allow_posh_dice_event_sources.sql` before running the script against production.
- The script filters to likely EDM/rave events using a weighted scorer over genre keywords, promoter hints, venue hints, and event-title hints.
- POSH ingestion now covers Los Angeles County, Orange County, San Diego County, San Bernardino County, and Riverside County, and dedupes across multiple time windows so you can pull a broader inventory without duplicating records.
- DICE region coverage is config-driven via `DICE_REGIONS_JSON`. Only the Los Angeles County browse URL is validated in-repo right now; additional county entries should use confirmed DICE browse URLs.
