# Release Checklist

## Current baseline

- Mobile app builds with Expo SDK 54 and passes `pnpm typecheck`.
- Core product flows exist: auth, onboarding, profile, event RSVP, crew matching, chat, reporting, moderation queue, and curated event management.
- Realtime chat is wired.
- DICE/POSH ingestion is scheduled and health-checked.
- Client telemetry, crash fallback, and admin analytics surfaces exist.
- Push notification infrastructure exists, including device token storage and the `send-message-push` edge function.

## Must finish before closed beta

- [x] Apply the latest backend changes:
  - [x] Apply [0028_connection_rate_limits.sql](/Users/iamleom/Desktop/R4V3/supabase/migrations/0028_connection_rate_limits.sql)
  - [x] Apply [0035_harden_crew_group_flows.sql](/Users/iamleom/Desktop/R4V3/supabase/migrations/0035_harden_crew_group_flows.sql)
  - [x] Deploy [send-message-push/index.ts](/Users/iamleom/Desktop/R4V3/supabase/functions/send-message-push/index.ts)
- [ ] Run a real ingest and verify live inventory in-app:
  - [ ] `pnpm ingest:edm`
  - [ ] Spot-check DICE/POSH events in the app against source sites
- [ ] Complete real-device push QA:
  - [ ] Token registration appears in `device_push_tokens`
  - [ ] Background message push arrives on a physical device
  - [ ] Push tap opens the correct conversation
  - [ ] Push failures appear in `system_alerts` when forced
- [ ] Complete end-to-end auth QA:
  - [ ] sign up
  - [ ] log in
  - [ ] sign out
  - [ ] invalid credentials handling
  - [ ] session restore after app relaunch
- [ ] Complete end-to-end onboarding QA:
  - [ ] birthdate wheel/date picker
  - [ ] current-location city capture
  - [ ] denied location permission flow
  - [ ] onboarding completion persists correctly
- [ ] Complete end-to-end events QA:
  - [ ] discovery loads and infinite scroll is stable
  - [ ] flyers load cleanly
  - [ ] RSVP updates work
  - [ ] crew tab reflects `I'm Going`
  - [ ] event counts and audience metrics refresh correctly
- [ ] Complete end-to-end crew/chat QA:
  - [ ] crew candidates load
  - [ ] like/pass actions work
  - [ ] connection rate-limit copy is readable
  - [ ] matched flow opens chat
  - [ ] chat send/read/report/block/unblock all work
- [ ] Complete moderation QA:
  - [ ] reports land in moderation queue
  - [ ] moderator can resolve queue items
  - [ ] moderator can hide/suspend targets when needed
- [ ] Validate analytics and crash/error visibility:
  - [ ] `screen_view` events appear in admin analytics
  - [ ] client errors appear in admin analytics
  - [ ] fatal errors are captured in admin analytics

## Strongly recommended before closed beta

- [ ] Complete iOS preview build from `apps/mobile`
- [ ] Complete Android preview build from `apps/mobile`
- [ ] Add production app icons, splash image, and adaptive icon assets.
- [ ] Run a focused device QA matrix:
  - [ ] one newer iPhone
  - [ ] one smaller/older device if available
  - [ ] one Android device if Android beta matters
- [ ] Run network-condition QA:
  - [ ] airplane mode
  - [ ] weak network
  - [ ] background/resume after reconnect
- [ ] Verify backup / rollback process for migrations.
- [ ] Create a lightweight beta support process:
  - [ ] bug-report channel
  - [ ] alert owner
  - [ ] moderation owner

## Public launch requirements

- [ ] Publish privacy policy and terms of service to a public URL.
- [ ] Add support URL and privacy policy URL to App Store Connect / Play Console metadata.
- [ ] Prepare store listing copy, keywords, screenshots, and age rating responses.
- [ ] Verify location and photo permission copy on-device matches actual app behavior.
- [ ] Confirm account deletion path for public self-serve account creation.
- [ ] Add final icon paths once assets exist.
- [ ] If you use production deep links, add associated domains / Android intent filters.
- [ ] Create separate staging and production Supabase projects if you intend to test releases safely.

## Build / config status

- [x] `eas.json` exists at repo root.
- [x] `apps/mobile/eas.json` exists for app-directory EAS builds in the monorepo.
- [x] `runtimeVersion` and OTA updates policy are configured in [app.config.ts](/Users/iamleom/Desktop/R4V3/apps/mobile/app.config.ts).
- [x] `ios.buildNumber` and `android.versionCode` are present in [app.config.ts](/Users/iamleom/Desktop/R4V3/apps/mobile/app.config.ts).
- [x] Expo owner and EAS project ID are wired in [app.config.ts](/Users/iamleom/Desktop/R4V3/apps/mobile/app.config.ts).
- [x] Env-driven Expo config replaced embedded app secrets.

## Backend / ops status

- [x] EDM ingest is scheduled in GitHub Actions.
- [x] EDM healthcheck is scheduled in GitHub Actions.
- [x] Manual/curated events are supported in backend and moderator UI.
- [x] Crash reporting and client event telemetry exist in-app.
- [x] Admin analytics and system alerts exist.
- [x] Latest push and connection hardening changes are deployed.

## Recommended command sequence

```bash
pnpm install
pnpm typecheck
pnpm ingest:edm
cd apps/mobile
eas build --platform ios --profile preview
eas build --platform android --profile preview
```

## Definition of done for first closed beta

- Physical-device builds install successfully.
- Auth, onboarding, events, crew, chat, reporting, and moderation complete end to end with no blocking bugs.
- Event inventory is reliably ingesting and visible in-app.
- Push notifications work on real devices.
- Moderator account is enabled and moderation queue is usable end to end.
- Client errors, fatal crashes, and push failures are visible in admin/alerts.
