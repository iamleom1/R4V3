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
