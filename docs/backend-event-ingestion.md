# Backend Event Ingestion (Ticketmaster -> Supabase)

This document covers the Supabase Edge Function path for Ticketmaster ingestion.

For the external EDM scraper path used for `dice.fm` and `posh.vip`, see [docs/edm-scraper-ingestion.md](/Users/iamleom/Desktop/R4V3/docs/edm-scraper-ingestion.md).

## What lives in the repo

- Edge Function: [supabase/functions/ingest-events/index.ts](/Users/iamleom/Desktop/R4V3/supabase/functions/ingest-events/index.ts)
- Job name recorded to `job_runs`: `ingest-events`
- Output tables: `events` and `event_sources`

The function:

- fetches Ticketmaster music events across a configured SoCal city set
- filters down to likely EDM/rave discovery inventory
- upserts event rows into Supabase
- records a `job_runs` entry after each run

## Required function secrets

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `TICKETMASTER_API_KEY`

## Optional function secrets

- `EVENT_INGEST_CRON_SECRET`
- `TICKETMASTER_COUNTRY_CODE`
- `TICKETMASTER_DEFAULT_CITY`
- `TICKETMASTER_KEYWORD`
- `TICKETMASTER_RADIUS_MILES`

## Request auth

The function accepts a bearer token matching either:

- `EVENT_INGEST_CRON_SECRET`
- `SUPABASE_SERVICE_ROLE_KEY`

Use the cron secret for scheduled/manual operational runs. Do not use the service-role key unless you explicitly need it.

## Manual run

```bash
curl -X POST 'https://<project-ref>.functions.supabase.co/ingest-events' \
  -H 'Authorization: Bearer <EVENT_INGEST_CRON_SECRET>' \
  -H 'Content-Type: application/json' \
  -d '{"city":"Los Angeles","daysAhead":30,"size":80,"radiusMiles":80}'
```

Common request fields:

- `city`
- `countryCode`
- `keyword`
- `daysAhead`
- `size`
- `radiusMiles`

Expected response shape:

```json
{
  "ok": true,
  "fetched": 13,
  "inserted": 13,
  "updated": 0,
  "city": "Los Angeles",
  "countryCode": "US",
  "daysAhead": 30,
  "radiusMiles": 80
}
```

## Suggested scheduling

If you want Ticketmaster ingestion to run inside Supabase, schedule `ingest-events` in the Supabase Dashboard:

1. Go to `Functions` -> `ingest-events` -> `Schedule`.
2. Use `POST`.
3. Set `Authorization: Bearer <EVENT_INGEST_CRON_SECRET>`.
4. Set `Content-Type: application/json`.
5. Use a body like:

```json
{"city":"Los Angeles","daysAhead":30,"size":80,"radiusMiles":80}
```

Daily cadence is the practical default.

## Notes

- The mobile app treats Supabase as the primary event source when configured.
- Ticketmaster ingestion and EDM scraper ingestion can coexist because they write to the same `events` inventory with different `source_primary` values.
- Keep `EVENT_INGEST_CRON_SECRET` private and rotate it if exposed.
