-- Crew discovery + event-scoped connection flow

alter table if exists public.event_rsvps
  drop constraint if exists event_rsvps_status_check;

alter table if exists public.event_rsvps
  add constraint event_rsvps_status_check check (status in ('going', 'none'));

create table if not exists public.crew_visibility (
  event_id uuid not null references public.events(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  is_looking boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (event_id, profile_id)
);

create table if not exists public.connections (
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

create table if not exists public.direct_threads (
  event_id uuid not null references public.events(id) on delete cascade,
  profile_a uuid not null references public.profiles(id) on delete cascade,
  profile_b uuid not null references public.profiles(id) on delete cascade,
  thread_id uuid not null references public.matches(id) on delete cascade,
  created_at timestamptz not null default now(),
  check (profile_a < profile_b),
  primary key (event_id, profile_a, profile_b),
  unique (thread_id)
);

create table if not exists public.event_rooms (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null unique references public.events(id) on delete cascade,
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.event_room_members (
  room_id uuid not null references public.event_rooms(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (room_id, profile_id)
);

create trigger crew_visibility_set_updated_at
before update on public.crew_visibility
for each row execute function public.set_updated_at();

create trigger connections_set_updated_at
before update on public.connections
for each row execute function public.set_updated_at();

create index if not exists crew_visibility_event_looking_idx
  on public.crew_visibility (event_id, is_looking, updated_at desc);

create index if not exists connections_event_status_idx
  on public.connections (event_id, status, updated_at desc);

create index if not exists connections_requester_idx
  on public.connections (requester_id, event_id);

create index if not exists connections_target_idx
  on public.connections (target_id, event_id);

alter table public.crew_visibility enable row level security;
alter table public.connections enable row level security;
alter table public.direct_threads enable row level security;
alter table public.event_rooms enable row level security;
alter table public.event_room_members enable row level security;

alter table public.crew_visibility force row level security;
alter table public.connections force row level security;
alter table public.direct_threads force row level security;
alter table public.event_rooms force row level security;
alter table public.event_room_members force row level security;

drop policy if exists "crew_visibility_select_authenticated" on public.crew_visibility;
create policy "crew_visibility_select_authenticated" on public.crew_visibility
for select to authenticated using (true);

drop policy if exists "crew_visibility_insert_self" on public.crew_visibility;
create policy "crew_visibility_insert_self" on public.crew_visibility
for insert to authenticated with check (profile_id = auth.uid());

drop policy if exists "crew_visibility_update_self" on public.crew_visibility;
create policy "crew_visibility_update_self" on public.crew_visibility
for update to authenticated using (profile_id = auth.uid()) with check (profile_id = auth.uid());

drop policy if exists "connections_select_participant" on public.connections;
create policy "connections_select_participant" on public.connections
for select to authenticated
using (requester_id = auth.uid() or target_id = auth.uid());

drop policy if exists "connections_insert_requester" on public.connections;
create policy "connections_insert_requester" on public.connections
for insert to authenticated
with check (requester_id = auth.uid());

drop policy if exists "connections_update_participant" on public.connections;
create policy "connections_update_participant" on public.connections
for update to authenticated
using (requester_id = auth.uid() or target_id = auth.uid())
with check (requester_id = auth.uid() or target_id = auth.uid());

drop policy if exists "direct_threads_select_participant" on public.direct_threads;
create policy "direct_threads_select_participant" on public.direct_threads
for select to authenticated
using (profile_a = auth.uid() or profile_b = auth.uid());

drop policy if exists "event_rooms_select_authenticated" on public.event_rooms;
create policy "event_rooms_select_authenticated" on public.event_rooms
for select to authenticated using (true);

drop policy if exists "event_rooms_insert_self" on public.event_rooms;
create policy "event_rooms_insert_self" on public.event_rooms
for insert to authenticated with check (created_by = auth.uid());

drop policy if exists "event_room_members_select_self" on public.event_room_members;
create policy "event_room_members_select_self" on public.event_room_members
for select to authenticated using (profile_id = auth.uid());

drop policy if exists "event_room_members_insert_self" on public.event_room_members;
create policy "event_room_members_insert_self" on public.event_room_members
for insert to authenticated with check (profile_id = auth.uid());

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
    from public.connections c
    cross join viewer v
    where c.event_id = p_event_id and c.requester_id = v.id
  ),
  incoming as (
    select c.requester_id as other_id, c.status
    from public.connections c
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
  left join public.crew_visibility cv
    on cv.event_id = r.event_id and cv.profile_id = r.profile_id
  cross join viewer v
  left join outgoing o on o.other_id = p.id
  left join incoming i on i.other_id = p.id
  where r.event_id = p_event_id
    and r.profile_id <> v.id
    and r.status = 'going'
    and coalesce(cv.is_looking, false) = true
  order by
    case
      when coalesce(i.status, '') = 'pending' then 0
      when coalesce(o.status, '') = 'pending' then 1
      when coalesce(o.status, '') = 'matched' or coalesce(i.status, '') = 'matched' then 2
      else 3
    end,
    coalesce(cv.updated_at, r.updated_at) desc
  limit greatest(coalesce(p_limit, 20), 1);
$$;

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

  insert into public.connections (event_id, requester_id, target_id, status)
  values (p_event_id, v_uid, p_target_id, 'pending')
  on conflict (event_id, requester_id, target_id)
  do update set status = excluded.status, updated_at = now();

  select exists (
    select 1
    from public.connections c
    where c.event_id = p_event_id
      and c.requester_id = p_target_id
      and c.target_id = v_uid
      and c.status in ('pending', 'matched')
  ) into v_has_reverse;

  if v_has_reverse then
    update public.connections
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

-- Restrict DM reads/sends to matched direct threads only.
drop policy if exists "messages_select_participant" on public.messages;
create policy "messages_select_participant" on public.messages
for select
to authenticated
using (
  exists (
    select 1
    from public.direct_threads dt
    where dt.thread_id = public.messages.match_id
      and (dt.profile_a = auth.uid() or dt.profile_b = auth.uid())
  )
  and exists (
    select 1
    from public.connections c
    where c.event_id = (
      select dt2.event_id from public.direct_threads dt2 where dt2.thread_id = public.messages.match_id limit 1
    )
      and c.status = 'matched'
      and ((c.requester_id = (select dt3.profile_a from public.direct_threads dt3 where dt3.thread_id = public.messages.match_id limit 1)
            and c.target_id = (select dt4.profile_b from public.direct_threads dt4 where dt4.thread_id = public.messages.match_id limit 1))
        or (c.requester_id = (select dt5.profile_b from public.direct_threads dt5 where dt5.thread_id = public.messages.match_id limit 1)
            and c.target_id = (select dt6.profile_a from public.direct_threads dt6 where dt6.thread_id = public.messages.match_id limit 1)))
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
    where dt.thread_id = public.messages.match_id
      and (dt.profile_a = auth.uid() or dt.profile_b = auth.uid())
  )
  and exists (
    select 1
    from public.connections c
    where c.event_id = (
      select dt2.event_id from public.direct_threads dt2 where dt2.thread_id = public.messages.match_id limit 1
    )
      and c.status = 'matched'
      and ((c.requester_id = (select dt3.profile_a from public.direct_threads dt3 where dt3.thread_id = public.messages.match_id limit 1)
            and c.target_id = (select dt4.profile_b from public.direct_threads dt4 where dt4.thread_id = public.messages.match_id limit 1))
        or (c.requester_id = (select dt5.profile_b from public.direct_threads dt5 where dt5.thread_id = public.messages.match_id limit 1)
            and c.target_id = (select dt6.profile_a from public.direct_threads dt6 where dt6.thread_id = public.messages.match_id limit 1)))
  )
);
