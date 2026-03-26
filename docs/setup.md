# Setup Guide (Phase 2 Bootstrap)

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

## 3. Configure Supabase

1. Create a new Supabase project.
2. Copy `apps/mobile/.env.example` to `apps/mobile/.env` and set:
   - `EXPO_PUBLIC_SUPABASE_URL`
   - `EXPO_PUBLIC_SUPABASE_ANON_KEY`
   - optional Ticketmaster values for local event fallback/testing
3. Apply SQL migration in `supabase/migrations/0001_init.sql`.
4. If you have not added Supabase keys yet, the app still runs in demo auth mode so you can continue UI flow work.

If using the Supabase CLI:

```bash
supabase login
supabase link --project-ref <project-ref>
supabase db push
```

For release builds, do not store production values in tracked files. Use EAS environment variables instead.

## 4. What Is Included

- App shell with three tabs (`Events`, `Matches`, `Profile`)
- Theme tokens and reusable card component
- Supabase client initialization point
- Core tables and baseline RLS policies for:
  - profiles/photos
  - events/event sources/RSVPs
  - swipes/matches/messages
  - blocks/reports/moderation queue

## 5. Next Build Step

Implement M2:

- auth session provider
- onboarding wizard (age gate, guidelines consent)
- profile editor + photo uploads (Supabase Storage)
- persist onboarding profile data to Supabase (`profiles` upsert)
