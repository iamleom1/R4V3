# EDM Operations

## External scheduler

This repo now includes GitHub Actions workflows for the EDM scraper jobs:

- `/.github/workflows/edm-ingest.yml`
  - runs `pnpm run:edm:ingest`
  - cadence: every 6 hours
- `/.github/workflows/edm-healthcheck.yml`
  - runs `pnpm run:edm:healthcheck`
  - cadence: every hour

These jobs are intentionally outside Supabase.

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

Recommended starting values:

```text
EDM_HEALTHCHECK_MAX_RUN_AGE_HOURS=8
EDM_HEALTHCHECK_MIN_FETCHED=4
EDM_HEALTHCHECK_MIN_POSH_UPCOMING=2
EDM_HEALTHCHECK_MIN_DICE_UPCOMING=1
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

## After adding GitHub remote

1. Push this repo to GitHub.
2. Add the Actions secrets and variables.
3. Open `Actions` and run both workflows once manually.
4. Confirm:
   - ingest writes `job_runs` rows for `ingest-edm-events`
   - healthcheck creates alerts when thresholds are crossed
   - Slack/email notifications arrive when configured
