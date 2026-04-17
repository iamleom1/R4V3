# Architecture

Last updated: April 16, 2026

## Overview

`R4V3` is a mobile-first community and dating app for the EDM/rave scene. The current architecture is centered on:

- an Expo / React Native client in `apps/mobile`
- Supabase for auth, Postgres, storage, RPCs, and realtime-backed app data
- a mixed event-ingestion pipeline:
  - Supabase Edge Functions for Ticketmaster ingestion and backend maintenance
  - external Node jobs for `posh.vip` and `dice.fm` EDM inventory

The product model is community-first. Event discovery, event RSVP state, crew visibility, event-based matching, chat, and moderation are all part of the core architecture rather than add-ons.

## Client Architecture

## Stack

- `Expo`
- `React Native`
- `TypeScript`
- React Navigation

## Mobile structure

The mobile app is organized by feature area under [apps/mobile/src](/Users/iamleom/Desktop/R4V3/apps/mobile/src):

- [app](/Users/iamleom/Desktop/R4V3/apps/mobile/src/app): top-level app state and session/profile orchestration
- [features/auth](/Users/iamleom/Desktop/R4V3/apps/mobile/src/features/auth): sign-in and auth entry
- [features/onboarding](/Users/iamleom/Desktop/R4V3/apps/mobile/src/features/onboarding): onboarding flow and profile bootstrapping
- [features/events](/Users/iamleom/Desktop/R4V3/apps/mobile/src/features/events): discovery, event detail, RSVP, crew rooms, event-based matching, radio/weekend surfaces
- [features/matches](/Users/iamleom/Desktop/R4V3/apps/mobile/src/features/matches): swipe stack, filters, crew/match entry
- [features/messages](/Users/iamleom/Desktop/R4V3/apps/mobile/src/features/messages): conversations, direct chat, group chat
- [features/profile](/Users/iamleom/Desktop/R4V3/apps/mobile/src/features/profile): profile editing, photos, moderation/admin surfaces, event curation, scraper/admin monitoring
- [lib](/Users/iamleom/Desktop/R4V3/apps/mobile/src/lib): env, Supabase client, telemetry, push registration, user-facing error normalization
- [types](/Users/iamleom/Desktop/R4V3/apps/mobile/src/types): shared domain types

## State model

The primary shared client state lives in [AppProvider.tsx](/Users/iamleom/Desktop/R4V3/apps/mobile/src/app/AppProvider.tsx).

It is responsible for:

- auth/session restoration from Supabase
- profile hydration and persistence
- onboarding completion state
- match filter state
- push token registration lifecycle
- crash/error/analytics bootstrap

The provider exposes a `profileDraft` model rather than thin form-local state only. That lets onboarding, profile editing, and downstream discovery/matching surfaces share the same user state contract.

## Client data access pattern

Most features follow a repository-style pattern:

- event data: [eventRepository.ts](/Users/iamleom/Desktop/R4V3/apps/mobile/src/features/events/eventRepository.ts)
- match data: [matchRepository.ts](/Users/iamleom/Desktop/R4V3/apps/mobile/src/features/matches/matchRepository.ts)
- messaging: [messagesRepository.ts](/Users/iamleom/Desktop/R4V3/apps/mobile/src/features/messages/messagesRepository.ts)
- profile, photos, moderation, event curation: feature-specific repositories in `features/profile`

This keeps UI components relatively thin and concentrates backend queries, RPC calls, and fallback behavior in one place per domain.

## Fallback behavior

The app is partially designed to run in reduced/demo mode when full backend config is missing:

- some flows use local/demo fallback data
- some flows return empty or reduced states when Supabase is unavailable
- other backend-dependent actions still fail explicitly with configuration errors

That means the architecture supports partial demo operation, but not every feature is fully backend-optional.

## Backend Architecture

## Core platform

Supabase is the primary backend platform:

- Supabase Auth for identity
- Postgres with checked-in SQL migrations under [supabase/migrations](/Users/iamleom/Desktop/R4V3/supabase/migrations)
- RLS as the default access-control posture
- Storage for profile photos
- RPCs for higher-trust workflows and business rules
- `job_runs` and `system_alerts` for operations visibility

The current migration chain extends through [0038_add_event_music_preview_url.sql](/Users/iamleom/Desktop/R4V3/supabase/migrations/0038_add_event_music_preview_url.sql).

## Backend domains

The database/backend model supports these main domains:

- profiles and onboarding state
- profile photos
- events and event sources
- event RSVPs and crew visibility
- swipes, matches, and event-based connection creation
- direct messages and crew group chats
- reports, moderation queue, moderator actions
- telemetry and system alerts
- device push tokens

## Edge Functions

Current Supabase Edge Functions in [supabase/functions](/Users/iamleom/Desktop/R4V3/supabase/functions):

- `ingest-events`: Ticketmaster ingestion into `events`
- `prune-events`: event cleanup/retention maintenance
- `ops-monitor`: backend and event-inventory alert generation
- `send-message-push`: push-notification sending path
- `email-exists`: auth/account support helper

These functions handle the cases where backend work is operational, privileged, or better isolated from the mobile client.

## Event Inventory Architecture

The app has a hybrid event-inventory model.

## Source types

Client event records support:

- `ticketmaster`
- `posh`
- `dice`
- `manual`
- `seatgeek`

The practical ingestion paths currently represented in the repo are:

- Ticketmaster via Supabase Edge Function
- Posh + Dice via external Node scraper jobs
- manual/curated events via admin/profile surfaces

## Ticketmaster path

Ticketmaster ingestion is handled by [supabase/functions/ingest-events/index.ts](/Users/iamleom/Desktop/R4V3/supabase/functions/ingest-events/index.ts).

This path:

- queries Ticketmaster across a configured SoCal city set
- filters to likely EDM/rave discovery inventory
- upserts into `events` and `event_sources`
- records `job_runs`

## EDM scraper path

The external scraper pipeline is implemented in:

- [scripts/ingest-edm-events.mjs](/Users/iamleom/Desktop/R4V3/scripts/ingest-edm-events.mjs)
- [scripts/healthcheck-edm-ingest.mjs](/Users/iamleom/Desktop/R4V3/scripts/healthcheck-edm-ingest.mjs)
- [scripts/run-edm-job.mjs](/Users/iamleom/Desktop/R4V3/scripts/run-edm-job.mjs)

It is scheduled through GitHub Actions:

- [edm-ingest.yml](/Users/iamleom/Desktop/R4V3/.github/workflows/edm-ingest.yml)
- [edm-healthcheck.yml](/Users/iamleom/Desktop/R4V3/.github/workflows/edm-healthcheck.yml)

This path writes to the same backend inventory but is intentionally run outside Supabase because the upstream sources are scraped/fetched more naturally from a Node job environment.

## Matching And Messaging Architecture

## Matching model

Matching is event-aware rather than purely profile-global.

Key ideas:

- community mode is the default social mode
- dating mode is opt-in
- event attendance and event intent are major ranking/context signals
- crew visibility is tied to event participation

The client uses both profile state and event state to build match stacks and event-specific candidate previews.

## Messaging model

The app supports:

- direct 1:1 conversations
- event crew rooms / group chats

Messaging behavior is protected by backend rules and RPC-backed enforcement rather than trusting the client alone. Current backend hardening includes block enforcement, send-rate limits, and duplicate suppression.

## Trust, Safety, And Ops

Trust and safety are first-class architectural concerns, not postponed launch tasks.

Current system shape includes:

- block/report flows in the client
- moderation queue and moderator actions
- system alerts and admin surfaces
- client telemetry and client error recording
- push-token persistence and message push infrastructure

Admin and support-oriented client surfaces live under [features/profile](/Users/iamleom/Desktop/R4V3/apps/mobile/src/features/profile), including analytics, moderation, system alerts, and scraper-status views.

## Architectural Tradeoffs

## Strengths

- clear feature-based mobile organization
- strong Supabase leverage for auth/data/RPC/realtime-style workflows
- event inventory pipeline is flexible across multiple source types
- trust/safety and ops concerns are already represented in both schema and UI
- app can partially operate in demo/fallback mode

## Current constraints

- not all backend-dependent flows degrade cleanly when config is missing
- test infrastructure is behind the current feature surface
- realtime/message reliability still depends on repository/query behavior and operational correctness
- the architecture has grown beyond the original scaffold docs, so maintenance depends on keeping these docs current

## Related Docs

- Setup: [docs/setup.md](/Users/iamleom/Desktop/R4V3/docs/setup.md)
- Backend hardening: [docs/backend-hardening.md](/Users/iamleom/Desktop/R4V3/docs/backend-hardening.md)
- Ticketmaster ingestion: [docs/backend-event-ingestion.md](/Users/iamleom/Desktop/R4V3/docs/backend-event-ingestion.md)
- EDM scraper ops: [docs/edm-ops.md](/Users/iamleom/Desktop/R4V3/docs/edm-ops.md)
- TestFlight demo checklist: [docs/testflight-demo-checklist.md](/Users/iamleom/Desktop/R4V3/docs/testflight-demo-checklist.md)
