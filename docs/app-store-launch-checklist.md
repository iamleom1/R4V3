# App Store Launch Checklist

Last updated: June 10, 2026

This checklist is for shipping `R4V3` to the public App Store, not just TestFlight.

## Release Gate

- [ ] A current production iOS build is accepted in App Store Connect.
- [ ] A real-device release QA pass is completed on the exact build being submitted.
- [ ] App Store metadata, screenshots, URLs, and disclosures are complete.
- [ ] Trust and safety flows are verified in a production-style environment.
- [ ] Final icon, splash, and brand assets are approved.

## 1. Product Readiness

- [ ] App launch, sign-in, onboarding, discovery, RSVP, matching, chat, and profile editing work on a release build.
- [ ] Empty states are acceptable without relying on manual explanation from testers.
- [ ] External event links open reliably for Ticketmaster, POSH, and DICE events.
- [ ] Core event cards, event detail, and auth flows are visually stable on small and large iPhones.
- [ ] Critical flows do not rely on debug tooling, seeded local state, or simulator-only behavior.

## 2. Real Device QA

- [ ] Cold launch works from a fresh install.
- [ ] Relaunch and session restore work after force quit.
- [ ] App behaves correctly after backgrounding and foregrounding.
- [ ] Network loss and reconnect behavior are acceptable.
- [ ] Location permission allow and deny flows are acceptable.
- [ ] Photo library permission allow and deny flows are acceptable.
- [ ] Push notification registration and tap-through behavior are verified on physical hardware.
- [ ] Deep-link or external-link return behavior is acceptable.

## 3. Backend and Data

- [ ] Production Supabase environment variables are present and verified.
- [ ] Event ingestion is current enough that public users will not see stale inventory.
- [ ] Seed/demo-only assumptions are removed from any public-facing launch path.
- [ ] Moderation/reporting writes succeed in production.
- [ ] Account deletion works and is verified end to end.

## 4. App Store Connect

- [ ] App record exists for bundle ID `com.r4v3.app`.
- [ ] App name is finalized.
- [ ] Subtitle / short description is finalized.
- [ ] Promotional description is finalized.
- [ ] Keywords are finalized.
- [ ] Support URL is hosted and live.
- [ ] Privacy policy URL is hosted and live.
- [ ] Age rating questionnaire is completed accurately.
- [ ] Export compliance answer is completed.
- [ ] App Review contact information is set.
- [ ] Review notes explain the product clearly and do not depend on internal context.

## 5. Privacy and Compliance

- [ ] Privacy disclosures match actual app behavior for:
- [ ] account data
- [ ] birthdate / age
- [ ] city / location
- [ ] photos
- [ ] chat / user-generated content
- [ ] moderation / reports
- [ ] notifications, if enabled
- [ ] `NSPhotoLibraryUsageDescription` is accurate.
- [ ] `NSLocationWhenInUseUsageDescription` is accurate.
- [ ] Account deletion instructions are easy to find and work in-app.

## 6. Visual Assets

- [ ] Final app icon is approved.
- [ ] Launch / splash experience is approved.
- [ ] App Store screenshots are created from a current build.
- [ ] Screenshots show the real product state you want Apple and users to judge.

## 7. Release Verification

- [ ] `pnpm --filter @r4v3/mobile typecheck`
- [ ] `pnpm --filter @r4v3/mobile test -- --runInBand`
- [ ] Latest production build is created from the intended code state.
- [ ] The exact submitted build is smoke tested after install.

## 8. Suggested Submission Order

1. Host support, privacy, and terms pages on a public domain.
2. Finalize icon, splash, and App Store screenshots.
3. Run physical-device QA on the exact release candidate build.
4. Fill App Store Connect metadata and privacy disclosures.
5. Submit the current production build for review.

## Current Likely Gaps

Based on the checked-in repo, these are the most likely unresolved items:

- hosted support and privacy URLs still use placeholders
- push notification behavior still needs explicit physical-device validation
- release-build smoke testing still needs a final pass
- app icon and splash still need final approval for public launch
- App Store Connect metadata completion cannot be confirmed from the repo alone
