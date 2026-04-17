# Demo Account Seeding

This folder holds fixture data and optional local photos for seeded demo accounts.

## Files

- `demo-accounts.fixture.json`: demo-account definitions used by the seed/reset scripts.
- `photos/`: optional local profile photos referenced by `photoFile`.

## Expected photo setup

Place one image per seeded profile inside `photos/` using the filenames referenced by the fixture.

Example:

- `scripts/demo/photos/aria-house.png`
- `scripts/demo/photos/leo-techno.png`

The seed script uploads these images into the Supabase `profile-photos` bucket and writes matching rows into `public.photos`.

## Environment

The scripts require:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## Usage

```bash
pnpm seed:demo
pnpm reset:demo
```

Optional flags:

```bash
pnpm seed:demo -- --event-count 8 --city "Los Angeles"
pnpm seed:demo -- --dry-run
```
