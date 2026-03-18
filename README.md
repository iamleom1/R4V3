# R4V3

EDM / rave community and dating-style mobile app.

This repository is organized for a production-grade mobile app (`Expo` + `React Native`) and a Supabase backend managed via SQL migrations and RLS.

## Structure

- `apps/mobile` - React Native (Expo) app
- `supabase/migrations` - versioned database schema and policies
- `docs` - architecture and setup notes

## Current Status

Foundation scaffold:

- mobile app shell + theme + navigation placeholders
- domain types
- Supabase client wiring point
- core database tables + RLS baseline
- setup docs for local development

## Next Steps

1. Install dependencies and run the mobile app.
2. Create a Supabase project and apply migrations.
3. Implement auth + onboarding/profile flows (M2).

