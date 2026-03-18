# R4V3 Brand Identity (Working Spec)

## Brand Positioning

- `R4V3` is a community connection app for the rave / EDM scene.
- It is `community-first`, with `dating as an optional mode`.
- The product should feel nightlife-native, but not chaotic or cliché.
- Visual tone should communicate `trust`, `energy`, and `premium utility`.

## Brand Personality

- Connector
- Curated
- Respectful
- Electric
- Calm under pressure

What we are not:

- Generic dating app clone
- Hypersexual / hookup-forward
- Cartoon neon rave aesthetic
- Cold enterprise utility app

## Core Product Tone

- Short, direct, modern
- Community/event language first
- Clear consent wording
- Confident, not salesy

### Tone Examples (Preferred)

- `Find your crew before doors open`
- `Community first. Dating optional.`
- `Open event matching`
- `People going to this event`
- `Use this feature to match around a shared event`

### Tone to Avoid

- `Meet hot singles`
- `Find your soulmate tonight`
- Overly flirty or cheesy copy by default
- Vague safety language

## Visual Identity Principles

### Overall Mood

- `Dark venue` base
- `Warm ember` primary accent
- `Laser` secondary accents used sparingly
- `Glass/smoke` layered surfaces
- `Controlled glow`, not constant glow

### Design Goal

- Feel like a premium nightlife product with structure and trust
- Not a festival flyer pasted into a dating app

## Color System (Primary)

These are the current baseline directions and should be used consistently:

- `Canvas`: deep stage black / charcoal
- `Surface`: dark panel (slightly lifted from canvas)
- `SurfaceMuted`: quieter card/input fill
- `Border`: low-contrast warm dark border
- `TextPrimary`: warm near-white
- `TextSecondary`: muted sand / smoke text
- `Accent`: ember orange
- `AccentSoft`: dark ember tint for selected states

### Secondary Accent Use (Limited)

Allowed for art moments, event tiles, lasers, and emphasis:

- Violet / purple laser
- Magenta laser
- Cool electric blue

Rules:

- Do not use these as primary button colors
- Use them in artwork, glows, and decorative lighting
- Keep UI action hierarchy anchored to ember orange

## Typography Direction

### Personality

- Bold, compact, high-contrast headlines
- Clean readable body text
- Brand mark should feel custom and intentional

### Usage Rules

- Headlines: strong and short
- Subheads: informative, low-drama
- Body copy: concise, utility-focused
- Labels/chips: compact, uppercase or semi-uppercase where helpful

### `R4V3` Wordmark Guidance

- Large and visible on opening surfaces
- Tight weight, wider tracking
- Feels like a brand stamp, not placeholder text

## Motion Language

### Motion Characteristics

- Atmospheric
- Weighted
- Intentional
- Smooth, not playful-bouncy

### Good Motion Patterns

- Laser sweeps / stage light movement
- Panel reveal / collapse
- Card lift and settle
- Subtle parallax on layered surfaces

### Avoid

- Excessive bounce
- Constant flashing
- Random motion unrelated to interaction

## UI Surface Rules

### Surfaces

- Use dark layered surfaces (`canvas`, `surface`, `surfaceMuted`)
- Prefer subtle borders over heavy outlines
- Use shadow/glow lightly for depth

### Cards

- Rounded corners
- Low-contrast borders
- Visual hierarchy inside the card (title, context, action)
- Avoid dense text blocks on primary interaction cards

### Buttons

- Primary action: ember orange
- Secondary: dark muted surface
- Ghost: transparent/dark surface
- Maintain strong contrast and clear disabled states

## Screen-Level Identity Rules

## Match (Home)

- Primary experience = swipe stack
- Premium, immersive, stage-like
- Minimal text up top
- Card is the hero
- Allow profile expansion before swipe

## Discover

- Event tiles should feel like artwork / posters / album covers
- Tap tile to enter event matching
- Genre filtering remains available but not dominant
- Text should support discovery, not overwhelm it

## Messages

- Feels like crew coordination / community comms
- Warm and readable
- Conversation UI should remain calm and utility-first

## Onboarding

- Trust + safety tone
- Explicit consent language
- Calm and premium, not sterile forms

## Trust / Safety UX Identity

- Safety should feel integrated, not bolted on
- Consent language should be plain and direct
- Community mode should be the default visual emphasis
- Dating mode should be clearly opt-in and secondary

## Content & Imagery Direction (Future)

- Real event art/poster imagery in Discover tiles
- Profile photos should be clean and respectful
- Avoid stock-photo dating-app clichés
- Emphasize music culture, venue context, and community signals

## Implementation Notes (For Code)

- Keep token-driven styling (colors/type/radius/spacing)
- Avoid introducing random one-off colors per screen
- New screens should reference this spec before visual implementation
- Decorative effects (lasers/glows) should be isolated to hero/art areas

## Next UI Priorities (Design Consistency)

1. Apply a unified header pattern across all tabs
2. Add event artwork support to Discover tiles
3. Refine match card profile expansion hierarchy
4. Add messages unread states + badges using the same accent rules
5. Create a shared icon style language (outline vs filled, weight, radius)
