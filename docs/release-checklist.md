# Release Checklist

## Current baseline

- Mobile app builds with Expo SDK 54 and passes `pnpm typecheck`.
- Supabase migrations are synced through `0014`.
- Backend functions deployed: `ingest-events`, `prune-events`.
- Core MVP flows exist: auth, onboarding, profile, event RSVP, crew matching, chat, reporting, moderation queue, and curated event management.

## Blocking items before beta

- [x] Configure EAS credentials and complete Android preview builds from `apps/mobile` using `eas build --profile preview`.
- [ ] Complete iOS preview builds from `apps/mobile` once Apple Developer access is available.
- [x] Replace embedded API keys with env-driven Expo config in [app.config.ts](/Users/iamleom/Desktop/R4V3/apps/mobile/app.config.ts).
- [x] Set real EAS environment variables for the `preview` environment before preview builds.
- [ ] Add production app icons, splash image, and adaptive icon assets.
- [ ] Run a full QA sweep on iPhone and Android for:
- auth sign-in/sign-out
- onboarding persistence
- photo upload/delete
- RSVP and crew visibility toggles
- chat send/read/report flows
- moderation queue access

## App Store / Play requirements

- [ ] Publish privacy policy and terms of service to a public URL.
- [ ] Add support URL and privacy policy URL to App Store Connect / Play Console metadata.
- [ ] Prepare store listing copy, keywords, screenshots, and age rating responses.
- [ ] Confirm account deletion path. This is still a product/backend gap if you plan to ship account creation publicly.
- [ ] Verify location and photo permission copy on-device matches actual app behavior.

## Build / config requirements

- [x] `eas.json` exists at repo root.
- [x] `apps/mobile/eas.json` exists for app-directory EAS builds in the monorepo.
- [x] `runtimeVersion` and OTA updates policy are configured in [app.config.ts](/Users/iamleom/Desktop/R4V3/apps/mobile/app.config.ts).
- [x] `ios.buildNumber` and `android.versionCode` are present in [app.config.ts](/Users/iamleom/Desktop/R4V3/apps/mobile/app.config.ts).
- [x] Expo owner and EAS project ID are wired in [app.config.ts](/Users/iamleom/Desktop/R4V3/apps/mobile/app.config.ts).
- [ ] Add final icon paths once assets exist.
- [ ] If you use production deep links, add associated domains / Android intent filters.

## Backend / ops requirements

- [x] Keep backend migrations synced to remote.
- [ ] Configure scheduled runs for `ingest-events` and `prune-events` in Supabase Dashboard.
- [x] Manual/curated events are supported in the backend and moderator UI.
- [ ] Add crash reporting.
- [ ] Add analytics funnel events.
- [ ] Verify backup / rollback process for migrations.
- [ ] Create separate staging and production Supabase projects if you intend to test releases safely.

## Recommended command sequence

```bash
pnpm install
pnpm typecheck
cp apps/mobile/.env.example apps/mobile/.env
cd apps/mobile
eas build --platform ios --profile preview
eas build --platform android --profile preview
```

## Current EAS status

- `preview` environment exists and includes the required Supabase and Ticketmaster values.
- `apps/mobile` is now wired to Expo owner `r4v3` and EAS project `4652ccde-861e-4de9-82d3-35b040734568`.
- Android preview build path is working from `apps/mobile`.
- iOS preview builds are still blocked on Apple Developer account access / credentials.

## Definition of done for first closed beta

- Both preview builds install on physical devices.
- Supabase env values are no longer hardcoded in repo config.
- Privacy policy and support URL are publicly reachable.
- QA pass is complete with no blocking auth, photo, chat, or RSVP bugs.
- Moderator account is enabled and moderation queue is usable end-to-end.
