# Backend Hardening

## What is live

- Migration `0010_backend_hardening.sql` is applied remotely.
- Edge Function `prune-events` is deployed.

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

Manual run:

```bash
curl -X POST 'https://ceyhlxxcqwjsejxbraew.functions.supabase.co/prune-events' \
  -H 'Authorization: Bearer <BACKEND_MAINTENANCE_CRON_SECRET>' \
  -H 'Content-Type: application/json' \
  -d '{"cutoffDays":45}'
```

This deletes old events only when they have no linked RSVPs, matches, direct threads, or event rooms.

## Recommended schedules

1. `ingest-events`: every 6 hours
2. `prune-events`: once daily
