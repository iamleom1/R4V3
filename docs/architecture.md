# Architecture Notes (Initial)

## Mobile

- `Expo` + `React Native` + `TypeScript`
- Feature-oriented folders under `apps/mobile/src/features`
- Navigation shell established now; auth/onboarding gating comes next

## Backend

- `Supabase Auth` for identity
- `Postgres` with SQL migrations checked into repo
- `RLS` enforced at table level as default posture
- `Storage` for profile photos (bucket policies added in a later migration)
- `Realtime` for chat/messages after match

## Product Logic Direction

- Community mode is default; dating mode is explicit opt-in
- Event-based social graph is core ranking signal
- Safety flows (block/report/mod queue) are in the foundation, not deferred

## Near-Term Migrations

1. Matching RPCs/functions (mutual match creation)
2. Message moderation flags / rate limiting support tables
3. Admin roles / moderator permissions model
4. Storage bucket policies for profile photos

