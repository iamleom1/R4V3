-- Query performance indexes for event discovery and RSVP lookups

create index if not exists events_starts_at_idx
  on public.events (starts_at);

create index if not exists events_city_starts_at_idx
  on public.events (city, starts_at);

create index if not exists event_rsvps_profile_id_idx
  on public.event_rsvps (profile_id);

create index if not exists event_rsvps_event_id_idx
  on public.event_rsvps (event_id);

