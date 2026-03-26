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
export POSH_LIMIT_PER_REGION="24"
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
  "fetched": 18,
  "inserted": 12,
  "updated": 6,
  "bySource": {
    "dice": 7,
    "posh": 11
  }
}
```

## Notes

- Apply migration `0022_allow_posh_dice_event_sources.sql` before running the script against production.
- The script filters to likely EDM/rave events using keyword matching.
- Current DICE ingestion is configured for Los Angeles because that page exposes a stable server-rendered event payload.
