# TestFlight Demo Checklist

Last updated: April 16, 2026

This checklist is scoped to one goal: get `R4V3` into a stable iOS TestFlight demo state. It is not a public-launch checklist.

## Current read on the repo

- [x] Expo/EAS iOS release config exists in [app.config.ts](/Users/iamleom/Desktop/R4V3/apps/mobile/app.config.ts).
- [x] `eas.json` exists with `preview` and `production` profiles.
- [x] iOS native workspace and scheme exist in [apps/mobile/ios](/Users/iamleom/Desktop/R4V3/apps/mobile/ios).
- [x] `pnpm typecheck` passes.
- [x] `pnpm test:mobile -- --runInBand` passes.
- [ ] One release-style iOS build is completed and installed on a physical device.
- [ ] The intended demo path is verified end to end with real env/config values.

## P0 Blockers

- [x] Fix broken mobile tests so the baseline is not red.
  - [x] Mock or configure `@react-native-community/slider` for Jest so [EventDiscoveryScreen.test.tsx](/Users/iamleom/Desktop/R4V3/apps/mobile/src/features/events/__tests__/EventDiscoveryScreen.test.tsx) runs.
  - [x] Mock or configure `@react-native-community/slider` for Jest so [OnboardingScreen.test.tsx](/Users/iamleom/Desktop/R4V3/apps/mobile/src/features/onboarding/__tests__/OnboardingScreen.test.tsx) runs.
  - [x] Fix the onboarding-completion assertion failure in [AppProvider.test.tsx](/Users/iamleom/Desktop/R4V3/apps/mobile/src/app/__tests__/AppProvider.test.tsx).
  - [x] Clean up the `act(...)` warnings around [EventDetailScreen.tsx](/Users/iamleom/Desktop/R4V3/apps/mobile/src/features/events/EventDetailScreen.tsx) tests.
- [ ] Finalize the exact TestFlight demo script.
  - [x] Confirm the demo mode strategy.
    - [x] Live Supabase data is the source of truth for events, users, and chats.
    - [x] Seeded demo accounts are pre-created and attached to key events to avoid empty states.
    - [x] Fallback logic is used only for edge cases with real data.
    - [x] The demo does not use fake data or static demo content.
  - [ ] Seed and verify demo accounts for the chosen event set.
    - [ ] Create roughly 10-20 seeded demo accounts with varied bios, vibes, and profile photos.
    - [ ] Attach seeded demo accounts to 5-10 key Los Angeles events.
    - [ ] Mark a mix of seeded demo accounts as `going` and `interested`.
  - [x] Remove any flows from the demo path that still fail hard when backend config is missing.
  - [ ] Write the exact tester click-path for the hybrid demo.
- [ ] Verify required runtime env/config is available for the demo build.
  - [x] `EXPO_PUBLIC_SUPABASE_URL`
  - [x] `EXPO_PUBLIC_SUPABASE_ANON_KEY`
  - [x] `EXPO_PUBLIC_TICKETMASTER_API_KEY`
  - [x] `EXPO_IOS_BUNDLE_IDENTIFIER`
  - [x] `EXPO_IOS_BUILD_NUMBER`

## P1 Demo Reliability

- [x] Run end-to-end QA on the exact iPhone demo path.
  - [x] app launch
  - [x] auth or demo sign-in
  - [x] onboarding
  - [x] event discovery
  - [x] event detail
  - [x] RSVP / crew intent
  - [x] matching flow
  - [x] 1:1 chat or crew chat
- [x] Verify backend-dependent screens fail gracefully.
  - [x] messaging
  - [x] match loading
  - [x] profile photo upload
  - [x] moderation/reporting surfaces
  - [x] event actions that require Supabase
- [ ] Validate device permissions on real hardware.
  - [x] location allow flow
  - [x] location deny flow
  - [x] photo library allow flow
  - [x] photo library deny flow
  - [ ] push notification registration behavior
- [ ] Confirm the app has real production-facing visual assets.
  - [ ] app icon is final enough for TestFlight
  - [ ] splash screen is acceptable for testers

## P1 Build And Distribution

- [ ] Produce one clean iOS preview/TestFlight build.
  - [ ] increment iOS build number
  - [ ] run `eas build --platform ios --profile preview`
  - [ ] if using App Store Connect submission, run `eas submit --platform ios --profile production` or upload the archive through Xcode/Transporter
- [ ] Install the built app on at least one physical iPhone.
- [ ] Smoke test the installed build outside local dev tooling.
  - [ ] cold launch
  - [ ] relaunch/session restore
  - [ ] background/foreground
  - [ ] network loss / reconnect

## P2 App Store Connect Hygiene

- [ ] Confirm the app record exists in App Store Connect with the correct bundle ID.
- [ ] Fill in minimum metadata needed for internal/external TestFlight.
  - [ ] app name
  - [ ] privacy policy URL if required for the chosen tester scope
  - [ ] export compliance answer
  - [ ] beta description / notes
- [ ] Verify privacy disclosures match app behavior.
  - [ ] location usage
  - [ ] photo library usage
  - [ ] notifications if enabled in the demo

## Repo Command Checklist

- [ ] `pnpm install`
- [x] `pnpm typecheck`
- [x] `pnpm test:mobile -- --runInBand`
- [ ] `cd apps/mobile && eas build --platform ios --profile preview`

## Definition Of Done

- [x] Mobile tests are no longer failing on obvious baseline issues.
- [ ] The chosen demo path works on a physical iPhone without local dev tooling.
- [ ] Backend-backed steps in the demo are configured and verified.
- [ ] A new iOS build is uploaded to TestFlight.
- [ ] Tester notes explain exactly what to click through in the demo.
