-- Profile extras, location capture, immutable-field enforcement,
-- photo storage bucket policies, message read state, and nearby candidate RPC.

alter table public.profiles
  add column if not exists height text,
  add column if not exists zodiac text,
  add column if not exists education text,
  add column if not exists pronouns text,
  add column if not exists crew_style text,
  add column if not exists meetup_style text,
  add column if not exists safety_note text,
  add column if not exists location_lat double precision,
  add column if not exists location_lng double precision,
  add column if not exists location_accuracy_meters double precision,
  add column if not exists location_captured_at timestamptz;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_location_lat_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_location_lat_check
      check (location_lat is null or (location_lat >= -90 and location_lat <= 90));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_location_lng_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_location_lng_check
      check (location_lng is null or (location_lng >= -180 and location_lng <= 180));
  end if;
end $$;

create or replace function public.prevent_profile_identity_mutation_after_onboarding()
returns trigger
language plpgsql
as $$
begin
  if old.onboarding_completed then
    if coalesce(new.display_name, '') is distinct from coalesce(old.display_name, '') then
      raise exception 'Display name cannot be changed after onboarding is complete.';
    end if;

    if old.birthdate is not null and new.birthdate is distinct from old.birthdate then
      raise exception 'Birthdate cannot be changed after onboarding is complete.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_prevent_identity_mutation_after_onboarding on public.profiles;
create trigger profiles_prevent_identity_mutation_after_onboarding
before update on public.profiles
for each row
execute function public.prevent_profile_identity_mutation_after_onboarding();

create or replace function public.great_circle_distance_km(
  lat1 double precision,
  lng1 double precision,
  lat2 double precision,
  lng2 double precision
)
returns double precision
language sql
immutable
as $$
  select 6371.0 * acos(
    least(
      1.0,
      greatest(
        -1.0,
        cos(radians(lat1)) * cos(radians(lat2)) * cos(radians(lng2 - lng1))
        + sin(radians(lat1)) * sin(radians(lat2))
      )
    )
  );
$$;

create table if not exists public.message_read_states (
  match_id uuid not null references public.matches(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  last_read_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (match_id, profile_id)
);

drop trigger if exists message_read_states_set_updated_at on public.message_read_states;
create trigger message_read_states_set_updated_at
before update on public.message_read_states
for each row execute function public.set_updated_at();

alter table public.message_read_states enable row level security;
alter table public.message_read_states force row level security;

drop policy if exists "message_read_states_select_participant" on public.message_read_states;
create policy "message_read_states_select_participant" on public.message_read_states
for select
to authenticated
using (
  profile_id = auth.uid()
  and exists (
    select 1 from public.matches m
    where m.id = public.message_read_states.match_id
      and (m.profile_low_id = auth.uid() or m.profile_high_id = auth.uid())
  )
);

drop policy if exists "message_read_states_insert_self_participant" on public.message_read_states;
create policy "message_read_states_insert_self_participant" on public.message_read_states
for insert
to authenticated
with check (
  profile_id = auth.uid()
  and exists (
    select 1 from public.matches m
    where m.id = public.message_read_states.match_id
      and (m.profile_low_id = auth.uid() or m.profile_high_id = auth.uid())
  )
);

drop policy if exists "message_read_states_update_self_participant" on public.message_read_states;
create policy "message_read_states_update_self_participant" on public.message_read_states
for update
to authenticated
using (
  profile_id = auth.uid()
  and exists (
    select 1 from public.matches m
    where m.id = public.message_read_states.match_id
      and (m.profile_low_id = auth.uid() or m.profile_high_id = auth.uid())
  )
)
with check (
  profile_id = auth.uid()
  and exists (
    select 1 from public.matches m
    where m.id = public.message_read_states.match_id
      and (m.profile_low_id = auth.uid() or m.profile_high_id = auth.uid())
  )
);

create index if not exists messages_match_id_created_at_idx
  on public.messages (match_id, created_at desc)
  where deleted_at is null;

create or replace function public.mark_match_messages_read(p_match_id uuid)
returns timestamptz
language plpgsql
security invoker
as $$
declare
  v_uid uuid := auth.uid();
  v_last_read_at timestamptz;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  if not exists (
    select 1
    from public.matches m
    where m.id = p_match_id
      and (m.profile_low_id = v_uid or m.profile_high_id = v_uid)
  ) then
    raise exception 'Not a participant in this match';
  end if;

  select coalesce(max(created_at), now())
  into v_last_read_at
  from public.messages
  where match_id = p_match_id
    and deleted_at is null;

  insert into public.message_read_states (match_id, profile_id, last_read_at)
  values (p_match_id, v_uid, v_last_read_at)
  on conflict (match_id, profile_id) do update
    set last_read_at = excluded.last_read_at,
        updated_at = now();

  return v_last_read_at;
end;
$$;

create or replace function public.list_event_candidate_profiles_nearby(
  p_event_id uuid,
  p_limit int default 12,
  p_radius_km double precision default 80
)
returns table (
  profile_id uuid,
  display_name text,
  city text,
  vibe_tags text[],
  music_genres text[],
  height text,
  education text,
  distance_km double precision
)
language sql
security invoker
as $$
  with viewer as (
    select p.id, p.location_lat, p.location_lng
    from public.profiles p
    where p.id = auth.uid()
  )
  select
    p.id as profile_id,
    p.display_name,
    p.city,
    p.vibe_tags,
    p.music_genres,
    p.height,
    p.education,
    case
      when viewer.location_lat is not null
        and viewer.location_lng is not null
        and p.location_lat is not null
        and p.location_lng is not null
      then public.great_circle_distance_km(viewer.location_lat, viewer.location_lng, p.location_lat, p.location_lng)
      else null
    end as distance_km
  from public.event_rsvps r
  join public.profiles p on p.id = r.profile_id
  cross join viewer
  where r.event_id = p_event_id
    and r.profile_id <> viewer.id
    and r.status = 'going'
    and p.community_mode_enabled = true
    and p.onboarding_completed = true
    and (
      viewer.location_lat is null
      or viewer.location_lng is null
      or (
        p.location_lat is not null
        and p.location_lng is not null
        and public.great_circle_distance_km(viewer.location_lat, viewer.location_lng, p.location_lat, p.location_lng) <= p_radius_km
      )
    )
  order by
    case when viewer.location_lat is null or viewer.location_lng is null then 1 else 0 end,
    distance_km nulls last,
    r.updated_at desc
  limit greatest(coalesce(p_limit, 12), 1);
$$;

insert into storage.buckets (id, name, public)
values ('profile-photos', 'profile-photos', true)
on conflict (id) do nothing;

drop policy if exists "profile_photos_public_read" on storage.objects;
create policy "profile_photos_public_read" on storage.objects
for select
to authenticated
using (bucket_id = 'profile-photos');

drop policy if exists "profile_photos_owner_insert" on storage.objects;
create policy "profile_photos_owner_insert" on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'profile-photos'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "profile_photos_owner_update" on storage.objects;
create policy "profile_photos_owner_update" on storage.objects
for update
to authenticated
using (
  bucket_id = 'profile-photos'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'profile-photos'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "profile_photos_owner_delete" on storage.objects;
create policy "profile_photos_owner_delete" on storage.objects
for delete
to authenticated
using (
  bucket_id = 'profile-photos'
  and (storage.foldername(name))[1] = auth.uid()::text
);
