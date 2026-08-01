# App Store Metadata

Last updated: June 11, 2026

## App name

R4V3

## Subtitle

Find your crew before the first drop

## Promotional text

Discover events, RSVP, meet your crew, and connect with other attendees before you arrive.

## App Store description

R4V3 helps you discover events, find your crew, and connect with other people attending the same events before you arrive.

Use R4V3 to:

- discover upcoming events
- RSVP to shows you plan to attend
- opt into crew visibility for specific events
- match with other attendees going to the same event
- chat before the event starts
- manage your profile, photos, and preferences

R4V3 is designed for the live event community, with a focus on helping people feel more connected before they get to the venue.

## Keywords

rave,edm,events,festival,crew,concerts,techno,house,music,community

## Category

Primary: Social Networking

Secondary: Music

## Support URL

[https://iamleom1.github.io/support.html](https://iamleom1.github.io/support.html)

## Privacy Policy URL

[https://iamleom1.github.io/privacy.html](https://iamleom1.github.io/privacy.html)

## Marketing URL

Leave blank until a real public website exists.

## Copyright

Leonardo Medina

## Review notes

R4V3 helps users discover events, RSVP, opt into crew visibility, connect with other attendees, and chat around shared events. The core flow is: create account, complete onboarding, browse events, open event detail, RSVP, optionally enable crew visibility, then access matching and messaging features.

Important review context:

- location permission is optional and used to improve nearby event discovery and crew matching
- photo library permission is optional and used for profile photo upload
- external event links may open third-party event pages such as Ticketmaster, POSH, or DICE for ticketing
- users can delete their account in-app from Profile > Settings > Delete Account
- terms of service and privacy policy links are shown directly on the auth screen before login or account creation
- in-app reporting is available from Messages > open any direct conversation > top-right menu > Report profile, and by long-pressing an incoming message > Report message
- blocking is available from Messages > open any direct conversation > top-right menu > Block user
- submitted reports are written to the moderation queue for review, and abusive accounts can be hidden or suspended by moderators
- Apple Sign In and Google Sign In may be enabled as login methods before launch

## TestFlight beta notes

R4V3 is a social app for discovering events, RSVPing, finding event crews, and chatting with other attendees. Please complete onboarding, RSVP to an event, enable crew visibility, try matching, and send a test chat message.

Please report the step where anything breaks, your device model, iOS version, and the account email used.

## Export Compliance

Recommended answer:

`No, this app does not use non-exempt encryption.`

Reason: `ITSAppUsesNonExemptEncryption` is set to `false` in [app.config.ts](/Users/iamleom/Desktop/R4V3/apps/mobile/app.config.ts). The app uses standard platform and HTTPS encryption and does not implement custom non-exempt cryptography.

## Age rating guidance

Recommended baseline answers to review in App Store Connect:

- Frequent/Intense Contests: No
- Frequent/Intense Gambling: No
- Frequent/Intense Horror/Fear Themes: No
- Frequent/Intense Mature/Suggestive Themes: No
- Frequent/Intense Medical/Treatment Information: No
- Frequent/Intense Profanity or Crude Humor: No
- Frequent/Intense Sexual Content or Nudity: No
- Frequent/Intense Simulated Gambling: No
- Frequent/Intense Alcohol, Tobacco, or Drug Use References: Possibly, review based on event content and community content
- Frequent/Intense Violence: No
- Unrestricted Web Access: No
- User Generated Content: Yes
- Messaging/Chat: Yes
- Location Sharing: Yes

Because the app includes user profiles, chat, and user-generated content around nightlife and live events, review the final age rating answers carefully in App Store Connect instead of blindly copying these.

## Suggested screenshot set

1. Event discovery feed
2. Event detail with RSVP and crew actions
3. Crew matching flow
4. Chat screen
5. Profile and photo setup

## Remaining launch dependencies

- final screenshots
- final App Store privacy disclosures
- final age rating questionnaire in App Store Connect
- optional marketing site when available
