# Setup Guide

Last updated: April 16, 2026

## 1. Install Dependencies

From repo root:

```bash
pnpm install
```

## 2. Run Mobile App

```bash
cd /Users/iamleom/Desktop/R4V3
pnpm dev:mobile
```

Or directly:

```bash
pnpm --filter @r4v3/mobile ios
pnpm --filter @r4v3/mobile android
```

## 3. Configure App Environment

1. Create a new Supabase project.
2. Copy `apps/mobile/.env.example` to `apps/mobile/.env` and set:
   - `EXPO_PUBLIC_SUPABASE_URL`
   - `EXPO_PUBLIC_SUPABASE_ANON_KEY`
   - `EXPO_PUBLIC_TICKETMASTER_API_KEY` if you want Ticketmaster-backed event discovery
   - optional Ticketmaster tuning values for local testing
3. If you plan to build native release previews, also set the versioning/build vars from `apps/mobile/.env.example` or EAS env config.
4. If you have not added Supabase keys yet, parts of the app still run in demo/fallback mode, but not every backend-backed flow is available.

## 4. Configure Supabase Schema

Apply the checked-in migrations in [supabase/migrations](/Users/iamleom/Desktop/R4V3/supabase/migrations), not just the initial migration.

If using the Supabase CLI:

```bash
supabase login
supabase link --project-ref <project-ref>
supabase db push
```

For release builds, do not store production values in tracked files. Use EAS environment variables instead.

## 5. Run The App

From repo root:

```bash
pnpm dev:mobile
```

Or run platform targets directly:

```bash
pnpm --filter @r4v3/mobile ios
pnpm --filter @r4v3/mobile android
```

Useful verification commands:

```bash
pnpm typecheck
pnpm test:mobile -- --runInBand
```

## 6. Current Product Surface

The repo already includes:

- auth and session restore
- onboarding and profile editing
- photo upload flows
- event discovery, RSVP, and crew visibility
- crew matching, direct chat, and group chat
- moderation, analytics, and system alerts
- Ticketmaster ingestion plus external POSH/DICE EDM ingestion
- EAS/TestFlight-oriented iOS project setup

The main remaining work is release hardening:

- physical-device QA
- production metadata and policy hosting
- migration rollback validation
- staged build verification

## 7. Related Docs

- Architecture: [docs/architecture.md](/Users/iamleom/Desktop/R4V3/docs/architecture.md)
- App Store launch checklist: [docs/app-store-launch-checklist.md](/Users/iamleom/Desktop/R4V3/docs/app-store-launch-checklist.md)
- Backend hardening: [docs/backend-hardening.md](/Users/iamleom/Desktop/R4V3/docs/backend-hardening.md)
