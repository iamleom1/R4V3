# EDM Operations

This document covers the external Node-based EDM scraper pipeline for `dice.fm` and `posh.vip`.

## What runs where

- Ingest script: [scripts/ingest-edm-events.mjs](/Users/iamleom/Desktop/R4V3/scripts/ingest-edm-events.mjs)
- Healthcheck script: [scripts/healthcheck-edm-ingest.mjs](/Users/iamleom/Desktop/R4V3/scripts/healthcheck-edm-ingest.mjs)
- Wrapper/logger: [scripts/run-edm-job.mjs](/Users/iamleom/Desktop/R4V3/scripts/run-edm-job.mjs)
- Scheduled workflows:
  - [.github/workflows/edm-ingest.yml](/Users/iamleom/Desktop/R4V3/.github/workflows/edm-ingest.yml)
  - [.github/workflows/edm-healthcheck.yml](/Users/iamleom/Desktop/R4V3/.github/workflows/edm-healthcheck.yml)

These jobs are intentionally outside Supabase and write into Supabase using the service-role key.

## GitHub workflow cadence

- `edm-ingest.yml`
  - runs `pnpm run:edm:ingest`
  - current cron: `0 */12 * * *`
- `edm-healthcheck.yml`
  - runs `pnpm run:edm:healthcheck`
  - current cron: `0 * * * *`

## Required GitHub secrets

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Optional notification secrets:

- `SLACK_WEBHOOK_URL`
- `RESEND_API_KEY`
- `ALERT_EMAIL_FROM`
- `ALERT_EMAIL_TO`

## GitHub repository variables

Set these as Actions Variables if you want to tune sensitivity:

- `EDM_HEALTHCHECK_MAX_RUN_AGE_HOURS`
- `EDM_HEALTHCHECK_MIN_FETCHED`
- `EDM_HEALTHCHECK_MIN_POSH_UPCOMING`
- `EDM_HEALTHCHECK_MIN_DICE_UPCOMING`
- `EDM_HEALTHCHECK_MIN_POSH_FETCHED_PER_RUN`
- `EDM_HEALTHCHECK_MIN_DICE_FETCHED_PER_RUN`
- `EDM_HEALTHCHECK_MAX_DUPLICATES`
- `EDM_HEALTHCHECK_MAX_BAD_EVENTS`

Recommended starting values:

```text
EDM_HEALTHCHECK_MAX_RUN_AGE_HOURS=18
EDM_HEALTHCHECK_MIN_FETCHED=4
EDM_HEALTHCHECK_MIN_POSH_UPCOMING=2
EDM_HEALTHCHECK_MIN_DICE_UPCOMING=1
EDM_HEALTHCHECK_MIN_POSH_FETCHED_PER_RUN=1
EDM_HEALTHCHECK_MIN_DICE_FETCHED_PER_RUN=1
EDM_HEALTHCHECK_MAX_DUPLICATES=0
EDM_HEALTHCHECK_MAX_BAD_EVENTS=0
```

## Log retention

Runtime logs are written under:

- `logs/edm/ingest`
- `logs/edm/healthcheck`

Each scheduled run:

- writes a timestamped `.log`
- writes a timestamped `.json` metadata file
- prunes local logs older than `EDM_LOG_RETENTION_DAYS` (default `14`)
- uploads the run logs as GitHub Actions artifacts with `retention-days: 14`

## Manual commands

```bash
pnpm run:edm:ingest
pnpm run:edm:healthcheck
```

Or use the wrapper that writes timestamped log and metadata files under `logs/edm`:

```bash
pnpm run:edm:ingest
pnpm run:edm:healthcheck
```

The root scripts already route through [scripts/run-edm-job.mjs](/Users/iamleom/Desktop/R4V3/scripts/run-edm-job.mjs).

## After adding GitHub remote

1. Push this repo to GitHub.
2. Add the Actions secrets and variables.
3. Open `Actions` and run both workflows once manually.
4. Confirm:
   - ingest writes `job_runs` rows for `ingest-edm-events`
   - healthcheck creates alerts when thresholds are crossed
   - Slack/email notifications arrive when configured
   - the latest ingest run is never older than 18 hours

## Related docs

- Scraper ingestion details: [docs/edm-scraper-ingestion.md](/Users/iamleom/Desktop/R4V3/docs/edm-scraper-ingestion.md)
- Supabase Ticketmaster ingestion: [docs/backend-event-ingestion.md](/Users/iamleom/Desktop/R4V3/docs/backend-event-ingestion.md)
