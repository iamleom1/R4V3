# App Store Metadata Draft

Last updated: April 23, 2026

## App name

R4V3

## Subtitle / short description

Find events, crews, and chats around the rave community.

## Promotional description

R4V3 helps you discover events, RSVP, find your crew, and connect with people around the same shows.

## iOS keywords

rave,edm,events,festival,crew,music,techno,house,concerts,community

## Support URL

Use the hosted public URL for [support.md](/Users/iamleom/Desktop/R4V3/docs/support.md).

Placeholder until hosted:

`https://YOUR_DOMAIN/support`

## Privacy policy URL

Use the hosted public URL for [privacy-policy.md](/Users/iamleom/Desktop/R4V3/docs/privacy-policy.md).

Placeholder until hosted:

`https://YOUR_DOMAIN/privacy`

## Export Compliance

Recommended App Store Connect answer:

`No, this app does not use non-exempt encryption.`

Reason: iOS config sets `ITSAppUsesNonExemptEncryption` to `false` in [app.config.ts](/Users/iamleom/Desktop/R4V3/apps/mobile/app.config.ts). The app uses standard platform/network encryption for HTTPS/Supabase traffic and does not implement custom or non-exempt cryptography.

## TestFlight beta notes

R4V3 is an early closed beta for discovering upcoming EDM events, RSVPing, finding event crews, and testing event-based chat. Please complete onboarding, RSVP to an event, enable crew visibility, try matching, and send a test chat message.

Known beta constraints:

- Los Angeles event inventory is the primary test market.
- Some event data comes from external providers and may change.
- Matching quality depends on seeded and early tester activity.
- Push notification behavior is still being validated.

Please report the step where anything breaks, your device model, iOS version, and the account email used.

## App Review / Beta Contact Notes

Use this for closed beta review notes:

R4V3 is in closed beta. The app is focused on Los Angeles EDM event discovery, RSVP, crew visibility, event-based matching, and chat. Demo seed data is already configured in the backend so event and match surfaces are not empty. Please test onboarding, event RSVP, crew visibility, matching, messaging, profile editing, and session restore.

If a login is needed, use a provided beta/demo account from the R4V3 team. Do not submit false safety reports unless specifically using a test-only account.

## Suggested screenshot set

1. Event discovery feed
2. Event detail with RSVP and crew counts
3. Crew matching flow
4. Chat and reporting flow
5. Profile setup and photos
6. Moderation queue, if you plan to demo trust/safety internally
