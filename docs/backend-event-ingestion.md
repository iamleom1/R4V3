# Backend Event Ingestion (Ticketmaster -> Supabase)

For Playwright-backed `posh.vip` and server-rendered `dice.fm` ingestion, see [docs/edm-scraper-ingestion.md](/Users/iamleom/Desktop/R4V3/docs/edm-scraper-ingestion.md).

## What is deployed

- Edge Function: `ingest-events`
- Project: `ceyhlxxcqwjsejxbraew`
- Endpoint: `https://ceyhlxxcqwjsejxbraew.functions.supabase.co/ingest-events`
- Function is deployed with `--no-verify-jwt` and uses internal bearer-token validation via `EVENT_INGEST_CRON_SECRET`.

## Secrets configured

- `TICKETMASTER_API_KEY`
- `TICKETMASTER_COUNTRY_CODE`
- `TICKETMASTER_DEFAULT_CITY`
- `TICKETMASTER_RADIUS_MILES`
- `EVENT_INGEST_CRON_SECRET`

## Manual run

Use the cron secret as bearer token:

```bash
curl -X POST 'https://ceyhlxxcqwjsejxbraew.functions.supabase.co/ingest-events' \
  -H 'Authorization: Bearer <EVENT_INGEST_CRON_SECRET>' \
  -H 'Content-Type: application/json' \
  -d '{"city":"Los Angeles","daysAhead":30,"size":80}'
```

Expected response shape:

```json
{
  "ok": true,
  "fetched": 13,
  "inserted": 13,
  "updated": 0
}
```

## Scheduler setup (recommended)

Create a Scheduled Function in Supabase Dashboard:

1. Go to Functions -> `ingest-events` -> Schedule.
2. Set cadence to every 6 hours.
3. Method: `POST`
4. Headers:
   - `Authorization: Bearer <EVENT_INGEST_CRON_SECRET>`
   - `Content-Type: application/json`
5. Body:

```json
{"city":"Los Angeles","daysAhead":30,"size":80}
```

## Notes

- Client app now treats Supabase as the source of truth for events when configured.
- Keep `EVENT_INGEST_CRON_SECRET` private and rotate if exposed.
