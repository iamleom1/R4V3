-- R4V3 initial schema
-- Foundation for identity-first community / dating-style app

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 2 and 40),
  bio text,
  birthdate date,
  city text,
  community_mode_enabled boolean not null default true,
  dating_mode_enabled boolean not null default false,
  vibe_tags text[] not null default '{}',
  music_genres text[] not null default '{}',
  onboarding_completed boolean not null default false,
  is_profile_hidden boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.photos (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  storage_path text not null unique,
  sort_order int not null default 0,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  unique (profile_id, sort_order)
);

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  venue_name text,
  city text,
  region text,
  country text,
  starts_at timestamptz not null,
  ends_at timestamptz,
  genre_tags text[] not null default '{}',
  source_primary text not null check (source_primary in ('ticketmaster', 'seatgeek', 'manual')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.event_sources (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  provider text not null check (provider in ('ticketmaster', 'seatgeek')),
  provider_event_id text not null,
  raw_payload jsonb,
  fetched_at timestamptz not null default now(),
  unique (provider, provider_event_id)
);

create table if not exists public.event_rsvps (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  status text not null check (status in ('going', 'interested')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, profile_id)
);

create table if not exists public.swipes (
  id uuid primary key default gen_random_uuid(),
  actor_profile_id uuid not null references public.profiles(id) on delete cascade,
  target_profile_id uuid not null references public.profiles(id) on delete cascade,
  event_id uuid references public.events(id) on delete set null,
  mode text not null check (mode in ('community', 'dating')),
  decision text not null check (decision in ('like', 'pass')),
  created_at timestamptz not null default now(),
  check (actor_profile_id <> target_profile_id)
);

-- Note: unique expressions cannot be declared inline portably in all tooling.
drop index if exists swipes_actor_target_mode_event_key_expr;
create unique index if not exists swipes_actor_target_mode_event_key_expr
  on public.swipes (
    actor_profile_id,
    target_profile_id,
    mode,
    coalesce(event_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

create table if not exists public.matches (
  id uuid primary key default gen_random_uuid(),
  profile_low_id uuid not null references public.profiles(id) on delete cascade,
  profile_high_id uuid not null references public.profiles(id) on delete cascade,
  mode text not null check (mode in ('community', 'dating')),
  event_id uuid references public.events(id) on delete set null,
  created_at timestamptz not null default now(),
  check (profile_low_id < profile_high_id)
);

drop index if exists matches_pair_mode_event_key_expr;
create unique index if not exists matches_pair_mode_event_key_expr
  on public.matches (
    profile_low_id,
    profile_high_id,
    mode,
    coalesce(event_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  sender_profile_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.blocks (
  id uuid primary key default gen_random_uuid(),
  blocker_profile_id uuid not null references public.profiles(id) on delete cascade,
  blocked_profile_id uuid not null references public.profiles(id) on delete cascade,
  reason text,
  created_at timestamptz not null default now(),
  check (blocker_profile_id <> blocked_profile_id),
  unique (blocker_profile_id, blocked_profile_id)
);

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_profile_id uuid not null references public.profiles(id) on delete cascade,
  target_profile_id uuid references public.profiles(id) on delete set null,
  message_id uuid references public.messages(id) on delete set null,
  event_id uuid references public.events(id) on delete set null,
  category text not null,
  details text,
  status text not null default 'queued' check (status in ('queued', 'in_review', 'resolved', 'dismissed')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid
);

create table if not exists public.moderation_queue (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null unique references public.reports(id) on delete cascade,
  priority int not null default 2 check (priority between 0 and 3),
  assigned_to uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create trigger events_set_updated_at
before update on public.events
for each row execute function public.set_updated_at();

create trigger event_rsvps_set_updated_at
before update on public.event_rsvps
for each row execute function public.set_updated_at();

create trigger moderation_queue_set_updated_at
before update on public.moderation_queue
for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.photos enable row level security;
alter table public.events enable row level security;
alter table public.event_sources enable row level security;
alter table public.event_rsvps enable row level security;
alter table public.swipes enable row level security;
alter table public.matches enable row level security;
alter table public.messages enable row level security;
alter table public.blocks enable row level security;
alter table public.reports enable row level security;
alter table public.moderation_queue enable row level security;

-- Profiles: users manage their own profile; all authenticated users can read visible profiles.
create policy "profiles_select_visible" on public.profiles
for select
to authenticated
using (not is_profile_hidden or id = auth.uid());

create policy "profiles_insert_self" on public.profiles
for insert
to authenticated
with check (id = auth.uid());

create policy "profiles_update_self" on public.profiles
for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

-- Photos: owner-managed
create policy "photos_select_authenticated" on public.photos
for select
to authenticated
using (true);

create policy "photos_insert_self" on public.photos
for insert
to authenticated
with check (profile_id = auth.uid());

create policy "photos_update_self" on public.photos
for update
to authenticated
using (profile_id = auth.uid())
with check (profile_id = auth.uid());

create policy "photos_delete_self" on public.photos
for delete
to authenticated
using (profile_id = auth.uid());

-- Events are readable by all authenticated users; writes should be service-role only.
create policy "events_select_authenticated" on public.events
for select
to authenticated
using (true);

create policy "event_sources_select_authenticated" on public.event_sources
for select
to authenticated
using (true);

-- RSVP owner-managed; read open to authenticated for attendee matching.
create policy "event_rsvps_select_authenticated" on public.event_rsvps
for select
to authenticated
using (true);

create policy "event_rsvps_insert_self" on public.event_rsvps
for insert
to authenticated
with check (profile_id = auth.uid());

create policy "event_rsvps_update_self" on public.event_rsvps
for update
to authenticated
using (profile_id = auth.uid())
with check (profile_id = auth.uid());

create policy "event_rsvps_delete_self" on public.event_rsvps
for delete
to authenticated
using (profile_id = auth.uid());

-- Swipes are private to the actor.
create policy "swipes_select_self" on public.swipes
for select
to authenticated
using (actor_profile_id = auth.uid());

create policy "swipes_insert_self" on public.swipes
for insert
to authenticated
with check (actor_profile_id = auth.uid());

-- Matches are visible to participants only.
create policy "matches_select_participant" on public.matches
for select
to authenticated
using (profile_low_id = auth.uid() or profile_high_id = auth.uid());

-- Messages are visible to participants through match membership.
create policy "messages_select_participant" on public.messages
for select
to authenticated
using (
  exists (
    select 1
    from public.matches m
    where m.id = messages.match_id
      and (m.profile_low_id = auth.uid() or m.profile_high_id = auth.uid())
  )
);

create policy "messages_insert_sender_participant" on public.messages
for insert
to authenticated
with check (
  sender_profile_id = auth.uid()
  and exists (
    select 1
    from public.matches m
    where m.id = messages.match_id
      and (m.profile_low_id = auth.uid() or m.profile_high_id = auth.uid())
  )
);

-- Blocks are private to blocker (read/write).
create policy "blocks_select_self" on public.blocks
for select
to authenticated
using (blocker_profile_id = auth.uid());

create policy "blocks_insert_self" on public.blocks
for insert
to authenticated
with check (blocker_profile_id = auth.uid());

create policy "blocks_delete_self" on public.blocks
for delete
to authenticated
using (blocker_profile_id = auth.uid());

-- Reports can be created by any authenticated user; visibility restricted to reporter.
create policy "reports_select_self" on public.reports
for select
to authenticated
using (reporter_profile_id = auth.uid());

create policy "reports_insert_self" on public.reports
for insert
to authenticated
with check (reporter_profile_id = auth.uid());

-- Moderation queue is reserved for service role/admin tooling (no user-facing policies).
