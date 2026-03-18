-- Unify event social graph around event_rsvps as the source of truth.
-- Discovery + matching + chat all event-scoped.

alter table if exists public.event_rsvps
  add column if not exists looking_for_crew boolean not null default false;

-- If legacy crew_visibility exists, backfill once into RSVP source of truth.
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'crew_visibility'
  ) then
    update public.event_rsvps r
    set looking_for_crew = cv.is_looking
    from public.crew_visibility cv
    where r.event_id = cv.event_id
      and r.profile_id = cv.profile_id;
  end if;
end $$;

-- Normalize connection table name.
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'connections'
  ) and not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'crew_connections'
  ) then
    alter table public.connections rename to crew_connections;
  end if;
end $$;

create table if not exists public.crew_connections (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  requester_id uuid not null references public.profiles(id) on delete cascade,
  target_id uuid not null references public.profiles(id) on delete cascade,
  status text not null check (status in ('pending', 'matched')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (requester_id <> target_id),
  unique (event_id, requester_id, target_id)
);

create index if not exists event_rsvps_discovery_idx
  on public.event_rsvps (event_id, status, looking_for_crew, updated_at desc);

create index if not exists crew_connections_event_status_idx
  on public.crew_connections (event_id, status, updated_at desc);

create index if not exists crew_connections_requester_idx
  on public.crew_connections (requester_id, event_id);

create index if not exists crew_connections_target_idx
  on public.crew_connections (target_id, event_id);

drop trigger if exists connections_set_updated_at on public.crew_connections;
create trigger crew_connections_set_updated_at
before update on public.crew_connections
for each row execute function public.set_updated_at();

alter table public.crew_connections enable row level security;
alter table public.crew_connections force row level security;

drop policy if exists "crew_connections_select_participant" on public.crew_connections;
create policy "crew_connections_select_participant" on public.crew_connections
for select to authenticated
using (requester_id = auth.uid() or target_id = auth.uid());

drop policy if exists "crew_connections_insert_requester" on public.crew_connections;
create policy "crew_connections_insert_requester" on public.crew_connections
for insert to authenticated
with check (requester_id = auth.uid());

drop policy if exists "crew_connections_update_participant" on public.crew_connections;
create policy "crew_connections_update_participant" on public.crew_connections
for update to authenticated
using (requester_id = auth.uid() or target_id = auth.uid())
with check (requester_id = auth.uid() or target_id = auth.uid());

-- Replace candidate discovery to use unified RSVP data.
create or replace function public.list_event_crew_candidates(
  p_event_id uuid,
  p_limit int default 20
)
returns table (
  profile_id uuid,
  display_name text,
  city text,
  vibe_tags text[],
  music_genres text[],
  height text,
  education text,
  connection_status text
)
language sql
security invoker
as $$
  with viewer as (
    select auth.uid() as id
  ),
  outgoing as (
    select c.target_id as other_id, c.status
    from public.crew_connections c
    cross join viewer v
    where c.event_id = p_event_id and c.requester_id = v.id
  ),
  incoming as (
    select c.requester_id as other_id, c.status
    from public.crew_connections c
    cross join viewer v
    where c.event_id = p_event_id and c.target_id = v.id
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
      when coalesce(o.status, '') = 'matched' or coalesce(i.status, '') = 'matched' then 'matched'
      when coalesce(i.status, '') = 'pending' then 'pending_incoming'
      when coalesce(o.status, '') = 'pending' then 'pending_outgoing'
      else 'none'
    end as connection_status
  from public.event_rsvps r
  join public.profiles p on p.id = r.profile_id
  cross join viewer v
  left join outgoing o on o.other_id = p.id
  left join incoming i on i.other_id = p.id
  where r.event_id = p_event_id
    and r.profile_id <> v.id
    and r.status = 'going'
    and r.looking_for_crew = true
  order by r.updated_at desc
  limit greatest(coalesce(p_limit, 20), 1);
$$;

-- Connect flow: event-scoped pending -> matched, then create event-scoped direct thread.
create or replace function public.connect_for_event(
  p_event_id uuid,
  p_target_id uuid
)
returns table (
  matched boolean,
  thread_id uuid,
  status text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_has_reverse boolean := false;
  v_match_id uuid;
  v_low uuid;
  v_high uuid;
begin
  if v_uid is null then
    raise exception 'auth_required';
  end if;

  if p_target_id is null or p_target_id = v_uid then
    raise exception 'invalid_target';
  end if;

  insert into public.crew_connections (event_id, requester_id, target_id, status)
  values (p_event_id, v_uid, p_target_id, 'pending')
  on conflict (event_id, requester_id, target_id)
  do update set status = excluded.status, updated_at = now();

  select exists (
    select 1
    from public.crew_connections c
    where c.event_id = p_event_id
      and c.requester_id = p_target_id
      and c.target_id = v_uid
      and c.status in ('pending', 'matched')
  ) into v_has_reverse;

  if v_has_reverse then
    update public.crew_connections
    set status = 'matched', updated_at = now()
    where event_id = p_event_id
      and ((requester_id = v_uid and target_id = p_target_id)
        or (requester_id = p_target_id and target_id = v_uid));

    v_low := least(v_uid, p_target_id);
    v_high := greatest(v_uid, p_target_id);

    insert into public.matches (profile_low_id, profile_high_id, mode, event_id)
    values (v_low, v_high, 'community', p_event_id)
    on conflict (
      profile_low_id,
      profile_high_id,
      mode,
      coalesce(event_id, '00000000-0000-0000-0000-000000000000'::uuid)
    ) do nothing
    returning id into v_match_id;

    if v_match_id is null then
      select m.id into v_match_id
      from public.matches m
      where m.profile_low_id = v_low
        and m.profile_high_id = v_high
        and m.mode = 'community'
        and m.event_id = p_event_id
      limit 1;
    end if;

    insert into public.direct_threads (event_id, profile_a, profile_b, thread_id)
    values (p_event_id, v_low, v_high, v_match_id)
    on conflict (event_id, profile_a, profile_b)
    do update set thread_id = excluded.thread_id;

    return query select true, v_match_id, 'matched'::text;
  end if;

  return query select false, null::uuid, 'pending'::text;
end;
$$;

grant execute on function public.list_event_crew_candidates(uuid, int) to authenticated;
grant execute on function public.connect_for_event(uuid, uuid) to authenticated;

-- Messaging gate: only event-scoped matched crew connections with direct thread.
drop policy if exists "messages_select_participant" on public.messages;
create policy "messages_select_participant" on public.messages
for select
to authenticated
using (
  exists (
    select 1
    from public.direct_threads dt
    join public.crew_connections c on c.event_id = dt.event_id and c.status = 'matched'
    where dt.thread_id = public.messages.match_id
      and (dt.profile_a = auth.uid() or dt.profile_b = auth.uid())
      and ((c.requester_id = dt.profile_a and c.target_id = dt.profile_b)
        or (c.requester_id = dt.profile_b and c.target_id = dt.profile_a))
  )
);

drop policy if exists "messages_insert_sender_participant" on public.messages;
create policy "messages_insert_sender_participant" on public.messages
for insert
to authenticated
with check (
  sender_profile_id = auth.uid()
  and exists (
    select 1
    from public.direct_threads dt
    join public.crew_connections c on c.event_id = dt.event_id and c.status = 'matched'
    where dt.thread_id = public.messages.match_id
      and (dt.profile_a = auth.uid() or dt.profile_b = auth.uid())
      and ((c.requester_id = dt.profile_a and c.target_id = dt.profile_b)
        or (c.requester_id = dt.profile_b and c.target_id = dt.profile_a))
  )
);
