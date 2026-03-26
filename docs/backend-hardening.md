# Backend Hardening

## What is live

- Migrations through `0016_anon_telemetry.sql` are applied remotely.
- Edge Functions deployed:
- `ingest-events`
- `prune-events`
- `ops-monitor`

## Messaging protections

- Message writes now enforce:
- sender must match `auth.uid()`
- blocked users cannot exchange messages
- max `12` messages per minute per sender
- max `60` messages per 10 minutes per sender
- duplicate body suppression within `20` seconds in the same match

- Mobile message sending now uses the `send_match_message` RPC instead of a direct insert plus pre-check.

## Moderation flow

- `create_report(...)` RPC is available to authenticated users.
- New reports automatically enqueue into `moderation_queue`.
- Queue priority is assigned from report category:
- `0`: `minor_safety`, `assault`, `harassment`, `stalking`, `violence`
- `1`: `spam`, `impersonation`, `hate`, `threat`
- `2`: everything else
- Moderator queue RPCs are available:
- `is_current_user_moderator()`
- `list_moderation_queue(...)`
- `update_report_status(...)`
- `moderate_profile_action(...)`
- `list_system_alerts(...)`
- `resolve_system_alert(...)`

Moderator actions now support:
- hide profile
- suspend profile
- system alert review

To grant moderator access to a profile, run this in Supabase SQL Editor:

```sql
update public.profiles
set is_moderator = true
where id = '<profile-uuid>';
```

## Maintenance job

- Function: `prune-events`
- Endpoint: `https://ceyhlxxcqwjsejxbraew.functions.supabase.co/prune-events`
- Auth: `Authorization: Bearer <BACKEND_MAINTENANCE_CRON_SECRET>`

- Function: `ops-monitor`
- Endpoint: `https://ceyhlxxcqwjsejxbraew.functions.supabase.co/ops-monitor`
- Auth: `Authorization: Bearer <BACKEND_MAINTENANCE_CRON_SECRET>` or service role

Manual run:

```bash
curl -X POST 'https://ceyhlxxcqwjsejxbraew.functions.supabase.co/prune-events' \
  -H 'Authorization: Bearer <BACKEND_MAINTENANCE_CRON_SECRET>' \
  -H 'Content-Type: application/json' \
  -d '{"cutoffDays":45}'
```

This deletes old events only when they have no linked RSVPs, matches, direct threads, or event rooms.

`ops-monitor` checks:
- stale or failing `ingest-events`
- stale or failing `prune-events`
- low upcoming-event inventory

And writes alerts into `system_alerts`.

## Account deletion

- RPC: `delete_my_account()`
- App entry point: `Profile -> Delete Account`

This deletes the current auth user and cascades profile-linked app data.

## Client telemetry

- Analytics RPC: `track_client_event(...)`
- Error RPC: `record_client_error(...)`

The mobile app now emits:
- auth events
- onboarding completion
- RSVP changes
- crew visibility changes
- message sends
- report submissions
- global JS crash reports

## Recommended schedules

1. `ingest-events`: every 6 hours
2. `prune-events`: once daily
3. `ops-monitor`: every hour
